package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/fisherevans/rsvp/internal/db"
	"github.com/fisherevans/rsvp/internal/render"
	"github.com/fisherevans/rsvp/internal/util"
	"github.com/go-chi/chi/v5"
)

// eventDetailsPayload is what the public/management event GETs return.
// Embeds the Event with attendees + responses on the side. DetailsHTML is the
// server-rendered, XSS-sanitized HTML version of DetailsMD - clients can
// set it directly via innerHTML.
type eventDetailsPayload struct {
	*db.Event
	DetailsHTML     string        `json:"details_html"`
	LockedEffective bool          `json:"locked_effective"`
	Attendees       []db.Attendee `json:"attendees"`
	Responses       []db.Response `json:"responses"`
}

// handleGetPublicPreview returns the same minimal info that the OG meta tags
// expose. Callable without the access code so the gate landing page can show
// the event name + theme before the user types it.
func (s *Server) handleGetPublicPreview(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"name":               e.Name,
		"slug":               e.Slug,
		"poster_image":       e.PosterImage,
		"theme_header_image": e.ThemeHeaderImage,
		"theme_accent":       e.ThemeAccent,
		"title_font":         e.TitleFont,
		"text_font":          e.TextFont,
		"title_scale":        e.TitleScale,
		"text_scale":         e.TextScale,
		"address_label":      e.AddressLabel,
	})
}

func (s *Server) handleGetPublicEvent(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	attendees, err := s.store.ListAttendees(r.Context(), e.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	responses, err := s.store.ListResponses(r.Context(), e.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if attendees == nil {
		attendees = []db.Attendee{}
	}
	if responses == nil {
		responses = []db.Response{}
	}
	writeJSON(w, http.StatusOK, eventDetailsPayload{
		Event:           e,
		DetailsHTML:     render.MarkdownToSafeHTML(e.DetailsMD),
		LockedEffective: e.LockedEffective(time.Now()),
		Attendees:       attendees,
		Responses:       responses,
	})
}

type attendeeInput struct {
	Name string `json:"name"`
}

func (s *Server) handlePutAttendee(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	var in attendeeInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		writeError(w, http.StatusBadRequest, "name required")
		return
	}
	a, created, err := s.store.FindOrCreateAttendee(r.Context(), e.ID, util.NewID(), in.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	s.audit(r.Context(), r, e.ID, "attendee.put", a.ID, map[string]any{
		"name":    a.Name,
		"created": created,
	})
	writeJSON(w, status, map[string]any{"attendee": a, "created": created})
}

func (s *Server) handleDeleteAttendee(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	id := chi.URLParam(r, "id")

	a, err := s.store.GetAttendee(r.Context(), id)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "attendee not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if a.EventID != e.ID {
		writeError(w, http.StatusNotFound, "attendee not found")
		return
	}
	inResp, err := s.store.AttendeeInResponse(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if inResp {
		writeError(w, http.StatusConflict, "attendee is in a response; remove or edit the response first")
		return
	}
	if err := s.store.DeleteAttendee(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.audit(r.Context(), r, e.ID, "attendee.delete", id, map[string]any{
		"name": a.Name,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type responseInput struct {
	ID               string   `json:"id"`
	AttendeeIDs      []string `json:"attendee_ids"`
	Status           string   `json:"status"`
	StatusNote       *string  `json:"status_note"`
	AdditionalGuests int      `json:"additional_guests"`
}

func (s *Server) handlePutResponse(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	var in responseInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return
	}
	merge := r.URL.Query().Get("merge") == "1"

	// Snapshot the prior state (if updating) so the audit log captures what
	// was overwritten.
	var before *db.Response
	if in.ID != "" {
		before, _ = s.store.GetResponse(r.Context(), in.ID)
	}

	resp, err := s.store.PutResponse(r.Context(), db.PutResponseInput{
		ID:               in.ID,
		EventID:          e.ID,
		Status:           in.Status,
		StatusNote:       in.StatusNote,
		AdditionalGuests: in.AdditionalGuests,
		AttendeeIDs:      in.AttendeeIDs,
	}, merge, util.NewID)
	if err != nil {
		var ce *db.ConflictError
		if errors.As(err, &ce) {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error":     ce.Error(),
				"conflicts": ce.Conflicts,
			})
			return
		}
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "response not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.audit(r.Context(), r, e.ID, "response.put", resp.ID, map[string]any{
		"before": before,
		"after":  resp,
		"merge":  merge,
	})
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleDeleteResponse(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	id := chi.URLParam(r, "id")
	// Snapshot the row before deletion so the audit log can carry it.
	before, _ := s.store.GetResponse(r.Context(), id)
	if err := s.store.DeleteResponse(r.Context(), e.ID, id); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "response not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.audit(r.Context(), r, e.ID, "response.delete", id, map[string]any{
		"before": before,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
