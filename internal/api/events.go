package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/fisherevans/rsvp/internal/db"
	"github.com/fisherevans/rsvp/internal/util"
	"github.com/go-chi/chi/v5"
)

type eventInput struct {
	Name             string    `json:"name"`
	Slug             string    `json:"slug"`
	StartsAt         time.Time `json:"starts_at"`
	EndsAt           time.Time `json:"ends_at"`
	Timezone         string    `json:"timezone"`
	DetailsMD        string    `json:"details_md"`
	Code             string    `json:"code"`
	Locked           *bool     `json:"locked"`
	ThemeAccent      *string   `json:"theme_accent"`
	TitleFont        *string   `json:"title_font"`
	TextFont         *string   `json:"text_font"`
	TitleScale       *float64  `json:"title_scale"`
	TextScale        *float64  `json:"text_scale"`
	TitleCase        *string   `json:"title_case"`
	ThemeHeaderImage *string   `json:"theme_header_image"`
	PosterImage      *string   `json:"poster_image"`
	Summary          *string   `json:"summary"`
	Address          *string   `json:"address"`
	AddressLabel     *string   `json:"address_label"`
	AllDay           *bool     `json:"all_day"`
	EndTimeHidden    *bool     `json:"end_time_hidden"`
	EndCondition     *string   `json:"end_condition"`
}

func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	events, err := s.store.ListEvents(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

func (s *Server) handleCreateEvent(w http.ResponseWriter, r *http.Request) {
	var in eventInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if in.StartsAt.IsZero() || in.EndsAt.IsZero() {
		writeError(w, http.StatusBadRequest, "starts_at and ends_at are required")
		return
	}
	if in.EndsAt.Before(in.StartsAt) {
		writeError(w, http.StatusBadRequest, "ends_at must be at or after starts_at")
		return
	}
	if in.Timezone == "" {
		in.Timezone = "America/Chicago"
	}
	if _, err := time.LoadLocation(in.Timezone); err != nil {
		writeError(w, http.StatusBadRequest, "invalid timezone: "+err.Error())
		return
	}

	slug := strings.TrimSpace(in.Slug)
	if slug == "" {
		slug = util.Slugify(in.Name)
	} else {
		slug = util.Slugify(slug)
	}
	if slug == "" {
		writeError(w, http.StatusBadRequest, "could not derive slug from name; provide an explicit slug")
		return
	}
	finalSlug, err := s.uniqueSlug(r.Context(), slug)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	code := strings.TrimSpace(in.Code)
	if code == "" {
		code = util.NewCode()
	}

	now := time.Now().UTC()
	e := &db.Event{
		ID:               util.NewID(),
		Slug:             finalSlug,
		Name:             in.Name,
		StartsAt:         in.StartsAt,
		EndsAt:           in.EndsAt,
		Timezone:         in.Timezone,
		DetailsMD:        in.DetailsMD,
		Code:             code,
		Locked:           false,
		ThemeAccent:      in.ThemeAccent,
		TitleFont:        in.TitleFont,
		TextFont:         in.TextFont,
		TitleScale:       valueOr(in.TitleScale, 1.0),
		TextScale:        valueOr(in.TextScale, 1.0),
		TitleCase:        valueOr(in.TitleCase, "upper"),
		ThemeHeaderImage: in.ThemeHeaderImage,
		PosterImage:      in.PosterImage,
		Summary:          in.Summary,
		Address:          in.Address,
		AddressLabel:     in.AddressLabel,
		EndCondition:     in.EndCondition,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if in.Locked != nil {
		e.Locked = *in.Locked
	}
	if in.AllDay != nil {
		e.AllDay = *in.AllDay
	}
	if in.EndTimeHidden != nil {
		e.EndTimeHidden = *in.EndTimeHidden
	}

	if err := s.store.CreateEvent(r.Context(), e); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

func (s *Server) handleGetMgmtEvent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	e, err := s.store.GetEventBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (s *Server) handlePatchEvent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	cur, err := s.store.GetEventBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Decode into a map so we can detect which fields were sent.
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}

	newSlug := ""
	apply := func(key string, fn func(json.RawMessage) error) {
		if v, ok := raw[key]; ok {
			if err := fn(v); err != nil {
				writeError(w, http.StatusBadRequest, key+": "+err.Error())
			}
		}
	}

	apply("name", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.Name) })
	apply("starts_at", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.StartsAt) })
	apply("ends_at", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.EndsAt) })
	apply("timezone", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.Timezone) })
	apply("details_md", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.DetailsMD) })
	apply("code", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.Code) })
	apply("locked", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.Locked) })
	apply("theme_accent", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.ThemeAccent) })
	apply("title_font", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.TitleFont) })
	apply("text_font", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.TextFont) })
	apply("title_scale", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.TitleScale) })
	apply("text_scale", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.TextScale) })
	apply("title_case", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.TitleCase) })
	apply("theme_header_image", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.ThemeHeaderImage) })
	apply("poster_image", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.PosterImage) })
	apply("summary", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.Summary) })
	apply("address", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.Address) })
	apply("address_label", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.AddressLabel) })
	apply("all_day", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.AllDay) })
	apply("end_time_hidden", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.EndTimeHidden) })
	apply("end_condition", func(v json.RawMessage) error { return json.Unmarshal(v, &cur.EndCondition) })

	if v, ok := raw["slug"]; ok {
		var candidate string
		if err := json.Unmarshal(v, &candidate); err != nil {
			writeError(w, http.StatusBadRequest, "slug: "+err.Error())
			return
		}
		candidate = util.Slugify(candidate)
		if candidate == "" {
			writeError(w, http.StatusBadRequest, "slug normalized to empty")
			return
		}
		if candidate != cur.Slug {
			taken, err := s.store.SlugExists(r.Context(), candidate)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if taken {
				writeError(w, http.StatusConflict, "slug already in use (active or retired)")
				return
			}
			newSlug = candidate
		}
	}

	if _, err := time.LoadLocation(cur.Timezone); err != nil {
		writeError(w, http.StatusBadRequest, "invalid timezone: "+err.Error())
		return
	}
	if cur.EndsAt.Before(cur.StartsAt) {
		writeError(w, http.StatusBadRequest, "ends_at must be at or after starts_at")
		return
	}

	if err := s.store.UpdateEvent(r.Context(), cur.ID, cur, newSlug); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Re-fetch to return canonical state (including refreshed old_slugs and updated_at).
	finalSlug := cur.Slug
	if newSlug != "" {
		finalSlug = newSlug
	}
	out, err := s.store.GetEventBySlug(r.Context(), finalSlug)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	cur, err := s.store.GetEventBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.store.DeleteEvent(r.Context(), cur.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleLock(w http.ResponseWriter, r *http.Request) {
	s.setLocked(w, r, true)
}

func (s *Server) handleUnlock(w http.ResponseWriter, r *http.Request) {
	s.setLocked(w, r, false)
}

func (s *Server) setLocked(w http.ResponseWriter, r *http.Request, locked bool) {
	slug := chi.URLParam(r, "slug")
	cur, err := s.store.GetEventBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	cur.Locked = locked
	if err := s.store.UpdateEvent(r.Context(), cur.ID, cur, ""); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"locked": locked})
}

func (s *Server) handleRegenerateCode(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	cur, err := s.store.GetEventBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	cur.Code = util.NewCode()
	if err := s.store.UpdateEvent(r.Context(), cur.ID, cur, ""); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"code": cur.Code})
}

func valueOr[T any](p *T, fallback T) T {
	if p == nil {
		return fallback
	}
	return *p
}

// uniqueSlug appends -2, -3, ... until the slug is unused across active and
// retired slugs.
func (s *Server) uniqueSlug(ctx context.Context, base string) (string, error) {
	candidate := base
	for i := 2; ; i++ {
		exists, err := s.store.SlugExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
		if i > 100 {
			return "", fmt.Errorf("could not find a unique slug for %q after 100 tries", base)
		}
	}
}
