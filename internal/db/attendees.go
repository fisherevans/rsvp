package db

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type Attendee struct {
	ID        string    `json:"id"`
	EventID   string    `json:"event_id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// FindOrCreateAttendee returns the existing attendee for a case-insensitive
// name match, or inserts a new one. created reports which path was taken.
func (s *Store) FindOrCreateAttendee(ctx context.Context, eventID, id, name string) (a *Attendee, created bool, err error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, false, errors.New("name required")
	}
	row := s.DB.QueryRowContext(ctx, `
        SELECT id, event_id, name, created_at
        FROM attendees
        WHERE event_id = ? AND lower(name) = lower(?)`, eventID, name)
	var existing Attendee
	if err := row.Scan(&existing.ID, &existing.EventID, &existing.Name, &existing.CreatedAt); err == nil {
		return &existing, false, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}

	now := time.Now().UTC()
	if _, err := s.DB.ExecContext(ctx, `
        INSERT INTO attendees (id, event_id, name, created_at)
        VALUES (?, ?, ?, ?)`, id, eventID, name, now); err != nil {
		return nil, false, err
	}
	return &Attendee{ID: id, EventID: eventID, Name: name, CreatedAt: now}, true, nil
}

func (s *Store) ListAttendees(ctx context.Context, eventID string) ([]Attendee, error) {
	rows, err := s.DB.QueryContext(ctx, `
        SELECT id, event_id, name, created_at
        FROM attendees WHERE event_id = ?
        ORDER BY lower(name)`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Attendee
	for rows.Next() {
		var a Attendee
		if err := rows.Scan(&a.ID, &a.EventID, &a.Name, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AttendeeInResponse reports whether the attendee is currently a member of
// any response. Used to surface a friendlier 409 from the delete handler.
func (s *Store) AttendeeInResponse(ctx context.Context, attendeeID string) (bool, error) {
	var n int
	if err := s.DB.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM response_attendees WHERE attendee_id = ?`, attendeeID).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *Store) DeleteAttendee(ctx context.Context, attendeeID string) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM attendees WHERE id = ?`, attendeeID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetAttendee fetches a single attendee. ErrNotFound if missing.
func (s *Store) GetAttendee(ctx context.Context, attendeeID string) (*Attendee, error) {
	row := s.DB.QueryRowContext(ctx, `
        SELECT id, event_id, name, created_at FROM attendees WHERE id = ?`, attendeeID)
	var a Attendee
	if err := row.Scan(&a.ID, &a.EventID, &a.Name, &a.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}
