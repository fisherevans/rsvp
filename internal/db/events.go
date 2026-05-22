package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type Event struct {
	ID               string    `json:"id"`
	Slug             string    `json:"slug"`
	Name             string    `json:"name"`
	StartsAt         time.Time `json:"starts_at"`
	EndsAt           time.Time `json:"ends_at"`
	Timezone         string    `json:"timezone"`
	DetailsMD        string    `json:"details_md"`
	Code             string    `json:"code"`
	Locked           bool      `json:"locked"`
	ThemeAccent      *string   `json:"theme_accent"`
	TitleFont        *string   `json:"title_font"`
	TextFont         *string   `json:"text_font"`
	TitleScale       float64   `json:"title_scale"`
	TextScale        float64   `json:"text_scale"`
	TitleCase        string    `json:"title_case"`
	ThemeHeaderImage *string   `json:"theme_header_image"`
	PosterImage      *string   `json:"poster_image"`
	Summary          *string   `json:"summary"`
	Address          *string   `json:"address"`
	AddressLabel     *string   `json:"address_label"`
	AllDay           bool      `json:"all_day"`
	EndTimeHidden    bool      `json:"end_time_hidden"`
	EndCondition     *string   `json:"end_condition"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
	OldSlugs         []string  `json:"old_slugs"`
}

// LockedEffective reports whether the event is currently locked for attendees.
// Either the manual flag is set or now() is past EndsAt.
func (e *Event) LockedEffective(now time.Time) bool {
	return e.Locked || now.After(e.EndsAt)
}

var ErrNotFound = errors.New("not found")

func (s *Store) CreateEvent(ctx context.Context, e *Event) error {
	titleScale, textScale := defaultScale(e.TitleScale), defaultScale(e.TextScale)
	_, err := s.DB.ExecContext(ctx, `
        INSERT INTO events (
            id, slug, name, starts_at, ends_at, timezone, details_md, code,
            locked, theme_accent, title_font, text_font, title_scale, text_scale, title_case,
            theme_header_image, poster_image, summary,
            address, address_label, all_day, end_time_hidden, end_condition, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.Slug, e.Name, e.StartsAt.UTC(), e.EndsAt.UTC(), e.Timezone,
		e.DetailsMD, e.Code, boolToInt(e.Locked),
		nullableString(e.ThemeAccent), nullableString(e.TitleFont), nullableString(e.TextFont),
		titleScale, textScale, defaultTitleCase(e.TitleCase),
		nullableString(e.ThemeHeaderImage), nullableString(e.PosterImage),
		nullableString(e.Summary),
		nullableString(e.Address), nullableString(e.AddressLabel),
		boolToInt(e.AllDay), boolToInt(e.EndTimeHidden), nullableString(e.EndCondition),
		e.CreatedAt.UTC(), e.UpdatedAt.UTC())
	return err
}

func defaultTitleCase(v string) string {
	switch v {
	case "upper", "lower", "normal":
		return v
	default:
		return "upper"
	}
}

func defaultScale(v float64) float64 {
	if v == 0 {
		return 1.0
	}
	return v
}

func (s *Store) ListEvents(ctx context.Context) ([]Event, error) {
	rows, err := s.DB.QueryContext(ctx, `
        SELECT id, slug, name, starts_at, ends_at, timezone, details_md, code,
               locked, theme_accent, title_font, text_font, title_scale, text_scale, title_case,
               theme_header_image, poster_image, summary,
               address, address_label, all_day, end_time_hidden, end_condition, created_at, updated_at
        FROM events
        ORDER BY starts_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// LookupEvent finds an event by slug or by a retired slug. When the lookup
// resolves via a retired slug, redirectTo is set to the current slug.
func (s *Store) LookupEvent(ctx context.Context, slug string) (e *Event, redirectTo string, err error) {
	e, err = s.GetEventBySlug(ctx, slug)
	if err == nil {
		return e, "", nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, "", err
	}
	// Try slug history.
	var eventID string
	if err := s.DB.QueryRowContext(ctx, `SELECT event_id FROM event_slug_history WHERE slug = ?`, slug).Scan(&eventID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, "", ErrNotFound
		}
		return nil, "", err
	}
	current, err := s.getEventByID(ctx, eventID)
	if err != nil {
		return nil, "", err
	}
	return current, current.Slug, nil
}

func (s *Store) GetEventBySlug(ctx context.Context, slug string) (*Event, error) {
	row := s.DB.QueryRowContext(ctx, `
        SELECT id, slug, name, starts_at, ends_at, timezone, details_md, code,
               locked, theme_accent, title_font, text_font, title_scale, text_scale, title_case,
               theme_header_image, poster_image, summary,
               address, address_label, all_day, end_time_hidden, end_condition, created_at, updated_at
        FROM events WHERE slug = ?`, slug)
	e, err := scanEvent(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := s.loadOldSlugs(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Store) getEventByID(ctx context.Context, id string) (*Event, error) {
	row := s.DB.QueryRowContext(ctx, `
        SELECT id, slug, name, starts_at, ends_at, timezone, details_md, code,
               locked, theme_accent, title_font, text_font, title_scale, text_scale, title_case,
               theme_header_image, poster_image, summary,
               address, address_label, all_day, end_time_hidden, end_condition, created_at, updated_at
        FROM events WHERE id = ?`, id)
	e, err := scanEvent(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := s.loadOldSlugs(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *Store) loadOldSlugs(ctx context.Context, e *Event) error {
	rows, err := s.DB.QueryContext(ctx, `SELECT slug FROM event_slug_history WHERE event_id = ? ORDER BY retired_at DESC`, e.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			return err
		}
		e.OldSlugs = append(e.OldSlugs, slug)
	}
	return rows.Err()
}

// SlugExists checks both active and retired slugs. Used pre-create to pick a
// non-colliding slug.
func (s *Store) SlugExists(ctx context.Context, slug string) (bool, error) {
	var n int
	if err := s.DB.QueryRowContext(ctx, `
        SELECT (SELECT COUNT(1) FROM events WHERE slug = ?)
             + (SELECT COUNT(1) FROM event_slug_history WHERE slug = ?)`, slug, slug).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// UpdateEvent rewrites mutable fields. If newSlug is non-empty and differs
// from the current slug, the old slug is retired into event_slug_history.
// All in one transaction.
func (s *Store) UpdateEvent(ctx context.Context, id string, e *Event, newSlug string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // rollback after commit is a no-op

	var curSlug string
	if err := tx.QueryRowContext(ctx, `SELECT slug FROM events WHERE id = ?`, id).Scan(&curSlug); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	finalSlug := curSlug
	if newSlug != "" && newSlug != curSlug {
		finalSlug = newSlug
	}

	// Update events first so the row no longer holds the old slug, then archive
	// the old slug into history. Reversing the order trips the trigger that
	// guards "a slug can't exist in both events and history at once."
	_, err = tx.ExecContext(ctx, `
        UPDATE events SET
            slug = ?, name = ?, starts_at = ?, ends_at = ?, timezone = ?,
            details_md = ?, code = ?, locked = ?,
            theme_accent = ?, title_font = ?, text_font = ?,
            title_scale = ?, text_scale = ?, title_case = ?,
            theme_header_image = ?, poster_image = ?, summary = ?,
            address = ?, address_label = ?,
            all_day = ?, end_time_hidden = ?, end_condition = ?,
            updated_at = ?
        WHERE id = ?`,
		finalSlug, e.Name, e.StartsAt.UTC(), e.EndsAt.UTC(), e.Timezone,
		e.DetailsMD, e.Code, boolToInt(e.Locked),
		nullableString(e.ThemeAccent), nullableString(e.TitleFont), nullableString(e.TextFont),
		defaultScale(e.TitleScale), defaultScale(e.TextScale), defaultTitleCase(e.TitleCase),
		nullableString(e.ThemeHeaderImage), nullableString(e.PosterImage),
		nullableString(e.Summary),
		nullableString(e.Address), nullableString(e.AddressLabel),
		boolToInt(e.AllDay), boolToInt(e.EndTimeHidden), nullableString(e.EndCondition),
		time.Now().UTC(), id)
	if err != nil {
		return err
	}

	if newSlug != "" && newSlug != curSlug {
		if _, err := tx.ExecContext(ctx, `INSERT INTO event_slug_history (slug, event_id) VALUES (?, ?)`, curSlug, id); err != nil {
			return fmt.Errorf("retire old slug: %w", err)
		}
	}

	return tx.Commit()
}

func (s *Store) DeleteEvent(ctx context.Context, id string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM events WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// rowScanner is the common interface of *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanEvent(r rowScanner) (*Event, error) {
	var e Event
	var locked, allDay, endHidden int
	var accent, titleFont, textFont, header, poster, summary, address, addressLabel, endCondition sql.NullString
	if err := r.Scan(&e.ID, &e.Slug, &e.Name, &e.StartsAt, &e.EndsAt, &e.Timezone,
		&e.DetailsMD, &e.Code, &locked, &accent, &titleFont, &textFont, &e.TitleScale, &e.TextScale, &e.TitleCase,
		&header, &poster, &summary,
		&address, &addressLabel, &allDay, &endHidden, &endCondition, &e.CreatedAt, &e.UpdatedAt); err != nil {
		return nil, err
	}
	e.Locked = locked != 0
	e.ThemeAccent = nullStringToPtr(accent)
	e.TitleFont = nullStringToPtr(titleFont)
	e.TextFont = nullStringToPtr(textFont)
	e.ThemeHeaderImage = nullStringToPtr(header)
	e.PosterImage = nullStringToPtr(poster)
	e.Summary = nullStringToPtr(summary)
	e.Address = nullStringToPtr(address)
	e.AddressLabel = nullStringToPtr(addressLabel)
	e.AllDay = allDay != 0
	e.EndTimeHidden = endHidden != 0
	e.EndCondition = nullStringToPtr(endCondition)
	return &e, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullableString(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func nullStringToPtr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	v := n.String
	return &v
}
