package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Response struct {
	ID               string    `json:"id"`
	EventID          string    `json:"event_id"`
	Status           string    `json:"status"`
	StatusNote       *string   `json:"status_note"`
	AdditionalGuests int       `json:"additional_guests"`
	AttendeeIDs      []string  `json:"attendee_ids"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// AttendeeConflict reports an attendee already assigned to a different
// response. The caller can choose to abort or merge.
type AttendeeConflict struct {
	AttendeeID         string `json:"attendee_id"`
	ExistingResponseID string `json:"existing_response_id"`
}

// ConflictError is returned by PutResponse when one or more requested
// attendees are already in another response and merge is false.
type ConflictError struct {
	Conflicts []AttendeeConflict
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("%d attendee(s) already in another response", len(e.Conflicts))
}

var (
	validStatuses = map[string]bool{
		"invited":       true,
		"maybe":         true,
		"not_attending": true,
		"attending":     true,
	}
)

// PutResponseInput is the canonical payload for creating or updating a
// response. If ID is empty a new response is created; otherwise the existing
// one is rewritten.
type PutResponseInput struct {
	ID               string
	EventID          string
	Status           string
	StatusNote       *string
	AdditionalGuests int
	AttendeeIDs      []string
}

// PutResponse creates or updates a response in a single transaction. When
// merge is false, returns *ConflictError if any attendee is already in
// another response. When merge is true, conflicting attendees are detached
// from their old responses (the old response is deleted if it ends up with
// zero attendees).
func (s *Store) PutResponse(ctx context.Context, in PutResponseInput, merge bool, newID func() string) (*Response, error) {
	in.Status = strings.TrimSpace(in.Status)
	if !validStatuses[in.Status] {
		return nil, fmt.Errorf("invalid status %q", in.Status)
	}
	if len(in.AttendeeIDs) == 0 {
		return nil, errors.New("at least one attendee is required")
	}
	// Deduplicate within the input.
	seen := map[string]bool{}
	deduped := in.AttendeeIDs[:0]
	for _, id := range in.AttendeeIDs {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		deduped = append(deduped, id)
	}
	in.AttendeeIDs = deduped

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() //nolint:errcheck

	// Verify all attendees belong to this event.
	for _, aid := range in.AttendeeIDs {
		var eid string
		if err := tx.QueryRowContext(ctx, `SELECT event_id FROM attendees WHERE id = ?`, aid).Scan(&eid); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, fmt.Errorf("attendee %s not found", aid)
			}
			return nil, err
		}
		if eid != in.EventID {
			return nil, fmt.Errorf("attendee %s does not belong to this event", aid)
		}
	}

	// Conflict detection: anyone already in a different response?
	var conflicts []AttendeeConflict
	for _, aid := range in.AttendeeIDs {
		var rid string
		err := tx.QueryRowContext(ctx,
			`SELECT response_id FROM response_attendees WHERE attendee_id = ?`, aid).Scan(&rid)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if rid == in.ID {
			// Same response - not a conflict (this is an update keeping the attendee).
			continue
		}
		conflicts = append(conflicts, AttendeeConflict{AttendeeID: aid, ExistingResponseID: rid})
	}
	if len(conflicts) > 0 && !merge {
		return nil, &ConflictError{Conflicts: conflicts}
	}

	// Merge path: detach attendees from their old responses, then clean up any
	// responses that end up empty.
	if len(conflicts) > 0 {
		affectedResponses := map[string]struct{}{}
		for _, c := range conflicts {
			affectedResponses[c.ExistingResponseID] = struct{}{}
			if _, err := tx.ExecContext(ctx,
				`DELETE FROM response_attendees WHERE attendee_id = ?`, c.AttendeeID); err != nil {
				return nil, err
			}
		}
		for rid := range affectedResponses {
			var n int
			if err := tx.QueryRowContext(ctx,
				`SELECT COUNT(1) FROM response_attendees WHERE response_id = ?`, rid).Scan(&n); err != nil {
				return nil, err
			}
			if n == 0 {
				if _, err := tx.ExecContext(ctx, `DELETE FROM responses WHERE id = ?`, rid); err != nil {
					return nil, err
				}
			}
		}
	}

	now := time.Now().UTC()

	if in.AdditionalGuests < 0 {
		in.AdditionalGuests = 0
	}

	if in.ID == "" {
		in.ID = newID()
		if _, err := tx.ExecContext(ctx, `
            INSERT INTO responses (id, event_id, status, status_note, additional_guests, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, in.ID, in.EventID, in.Status, nullableString(in.StatusNote), in.AdditionalGuests, now, now); err != nil {
			return nil, err
		}
	} else {
		// Update existing response. Clear attendee links so we can re-insert below.
		res, err := tx.ExecContext(ctx, `
            UPDATE responses SET status = ?, status_note = ?, additional_guests = ?, updated_at = ?
            WHERE id = ? AND event_id = ?`, in.Status, nullableString(in.StatusNote), in.AdditionalGuests, now, in.ID, in.EventID)
		if err != nil {
			return nil, err
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return nil, ErrNotFound
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM response_attendees WHERE response_id = ?`, in.ID); err != nil {
			return nil, err
		}
	}

	for _, aid := range in.AttendeeIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO response_attendees (response_id, attendee_id) VALUES (?, ?)`, in.ID, aid); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return s.GetResponse(ctx, in.ID)
}

func (s *Store) GetResponse(ctx context.Context, id string) (*Response, error) {
	row := s.DB.QueryRowContext(ctx, `
        SELECT id, event_id, status, status_note, additional_guests, created_at, updated_at
        FROM responses WHERE id = ?`, id)
	var r Response
	var note sql.NullString
	if err := row.Scan(&r.ID, &r.EventID, &r.Status, &note, &r.AdditionalGuests, &r.CreatedAt, &r.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	r.StatusNote = nullStringToPtr(note)
	rows, err := s.DB.QueryContext(ctx,
		`SELECT attendee_id FROM response_attendees WHERE response_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var aid string
		if err := rows.Scan(&aid); err != nil {
			return nil, err
		}
		r.AttendeeIDs = append(r.AttendeeIDs, aid)
	}
	return &r, rows.Err()
}

func (s *Store) ListResponses(ctx context.Context, eventID string) ([]Response, error) {
	rows, err := s.DB.QueryContext(ctx, `
        SELECT id, event_id, status, status_note, additional_guests, created_at, updated_at
        FROM responses WHERE event_id = ? ORDER BY created_at`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Response
	for rows.Next() {
		var r Response
		var note sql.NullString
		if err := rows.Scan(&r.ID, &r.EventID, &r.Status, &note, &r.AdditionalGuests, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.StatusNote = nullStringToPtr(note)
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Second pass: pull attendees for each. Cheap for small N; can batch later.
	for i := range out {
		ar, err := s.DB.QueryContext(ctx,
			`SELECT attendee_id FROM response_attendees WHERE response_id = ?`, out[i].ID)
		if err != nil {
			return nil, err
		}
		for ar.Next() {
			var aid string
			if err := ar.Scan(&aid); err != nil {
				ar.Close()
				return nil, err
			}
			out[i].AttendeeIDs = append(out[i].AttendeeIDs, aid)
		}
		ar.Close()
	}
	return out, nil
}

func (s *Store) DeleteResponse(ctx context.Context, eventID, id string) error {
	res, err := s.DB.ExecContext(ctx,
		`DELETE FROM responses WHERE id = ? AND event_id = ?`, id, eventID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
