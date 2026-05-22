package db

import (
	"context"
	"database/sql"
	"fmt"
)

// ensureSchema is an idempotent catch-up step that runs after the file-based
// migrations. It introspects the live schema via PRAGMA table_info and adds
// any missing columns / tables. Lets the dev DB survive schema changes that
// are made by editing 001_init.sql in place (which the migration runner
// won't re-apply) - existing rows are preserved instead of being wiped.
//
// When a new column is added, list it here with its SQL type + default.
// PRAGMA-based detection means re-running this is free.
func (s *Store) ensureSchema(ctx context.Context) error {
	type col struct{ name, def string }
	required := map[string][]col{
		"events": {
			{"locked", "INTEGER NOT NULL DEFAULT 0"},
			{"theme_accent", "TEXT"},
			{"title_font", "TEXT"},
			{"text_font", "TEXT"},
			{"title_scale", "REAL NOT NULL DEFAULT 1.0"},
			{"text_scale", "REAL NOT NULL DEFAULT 1.0"},
			{"title_case", "TEXT NOT NULL DEFAULT 'upper'"},
			{"theme_header_image", "TEXT"},
			{"poster_image", "TEXT"},
			{"summary", "TEXT"},
			{"address", "TEXT"},
			{"address_label", "TEXT"},
			{"all_day", "INTEGER NOT NULL DEFAULT 0"},
			{"end_time_hidden", "INTEGER NOT NULL DEFAULT 0"},
			{"end_condition", "TEXT"},
		},
		"responses": {
			{"status_note", "TEXT"},
			{"additional_guests", "INTEGER NOT NULL DEFAULT 0"},
		},
	}

	for table, cols := range required {
		existing, err := tableColumns(ctx, s.DB, table)
		if err != nil {
			return fmt.Errorf("introspect %s: %w", table, err)
		}
		// If the table doesn't exist at all, skip - the file migrations will
		// have created it. This step only adds columns to existing tables.
		if len(existing) == 0 {
			continue
		}
		for _, c := range cols {
			if existing[c.name] {
				continue
			}
			stmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, c.name, c.def)
			if _, err := s.DB.ExecContext(ctx, stmt); err != nil {
				return fmt.Errorf("add %s.%s: %w", table, c.name, err)
			}
		}
	}

	// audit_log is a self-contained table - safe to CREATE IF NOT EXISTS.
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS audit_log (
            id          TEXT PRIMARY KEY,
            event_id    TEXT,
            action      TEXT NOT NULL,
            target_id   TEXT,
            payload     TEXT NOT NULL DEFAULT '{}',
            source_ip   TEXT,
            user_agent  TEXT,
            at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
		`CREATE INDEX IF NOT EXISTS audit_log_event_at ON audit_log(event_id, at)`,
		`CREATE INDEX IF NOT EXISTS audit_log_action ON audit_log(action)`,
		`CREATE INDEX IF NOT EXISTS audit_log_source_ip ON audit_log(source_ip)`,
	}
	for _, q := range stmts {
		if _, err := s.DB.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("ensure audit_log: %w", err)
		}
	}

	return nil
}

func tableColumns(ctx context.Context, db *sql.DB, table string) (map[string]bool, error) {
	// PRAGMA table_info doesn't accept parameter binding for the table name,
	// so we splice. Table names come from this file - no user input.
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return nil, err
		}
		out[name] = true
	}
	return out, rows.Err()
}
