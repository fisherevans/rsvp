package db

import (
	"context"
	"database/sql"
	"time"
)

// AuditEntry is one row in audit_log. Payload is a JSON-encoded string;
// callers shape it however makes sense for the action.
type AuditEntry struct {
	ID        string
	EventID   string
	Action    string
	TargetID  string
	Payload   string
	SourceIP  string
	UserAgent string
}

// InsertAudit writes an audit row. Failures here should be logged by the
// caller but should never fail the user-visible request that triggered the
// audit - this is forensics, not access control.
func (s *Store) InsertAudit(ctx context.Context, e AuditEntry) error {
	_, err := s.DB.ExecContext(ctx, `
        INSERT INTO audit_log (id, event_id, action, target_id, payload, source_ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
		e.ID,
		nullableStr(e.EventID),
		e.Action,
		nullableStr(e.TargetID),
		e.Payload,
		nullableStr(e.SourceIP),
		nullableStr(e.UserAgent))
	return err
}

func nullableStr(s string) any {
	if s == "" {
		return sql.NullString{}
	}
	return s
}

// AuditRow is the read-shape of an audit_log row, with nullable columns as
// pointers so JSON callers can distinguish missing values.
type AuditRow struct {
	ID        string    `json:"id"`
	EventID   *string   `json:"event_id"`
	Action    string    `json:"action"`
	TargetID  *string   `json:"target_id"`
	Payload   string    `json:"payload"`
	SourceIP  *string   `json:"source_ip"`
	UserAgent *string   `json:"user_agent"`
	At        time.Time `json:"at"`
}

// AuditFilters narrow the result set. Empty values are ignored.
type AuditFilters struct {
	EventID  string
	Action   string
	SourceIP string
	Limit    int
}

// ListAudit returns recent audit rows in reverse chronological order, honoring
// the filters. Limit is clamped to [1, 1000].
func (s *Store) ListAudit(ctx context.Context, f AuditFilters) ([]AuditRow, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 1000 {
		limit = 1000
	}
	rows, err := s.DB.QueryContext(ctx, `
        SELECT id, event_id, action, target_id, payload, source_ip, user_agent, at
        FROM audit_log
        WHERE (? = '' OR event_id  = ?)
          AND (? = '' OR action    = ?)
          AND (? = '' OR source_ip = ?)
        ORDER BY at DESC
        LIMIT ?`,
		f.EventID, f.EventID,
		f.Action, f.Action,
		f.SourceIP, f.SourceIP,
		limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditRow
	for rows.Next() {
		var r AuditRow
		var eventID, targetID, sourceIP, userAgent sql.NullString
		if err := rows.Scan(&r.ID, &eventID, &r.Action, &targetID, &r.Payload,
			&sourceIP, &userAgent, &r.At); err != nil {
			return nil, err
		}
		r.EventID = nullStringToPtr(eventID)
		r.TargetID = nullStringToPtr(targetID)
		r.SourceIP = nullStringToPtr(sourceIP)
		r.UserAgent = nullStringToPtr(userAgent)
		out = append(out, r)
	}
	return out, rows.Err()
}
