package api

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"time"

	"github.com/fisherevans/rsvp/internal/db"
	"github.com/go-chi/chi/v5"
)

type ctxKey string

const eventCtxKey ctxKey = "event"

// eventFromCtx returns the event resolved by withEvent.
func eventFromCtx(r *http.Request) *db.Event {
	v, _ := r.Context().Value(eventCtxKey).(*db.Event)
	return v
}

// withEvent looks up the event by slug, redirecting through slug history if
// needed. Sets the event in context. 404 if unknown.
func (s *Server) withEvent(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		e, redirect, err := s.store.LookupEvent(r.Context(), slug)
		if err != nil {
			if errors.Is(err, db.ErrNotFound) {
				writeError(w, http.StatusNotFound, "event not found")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if redirect != "" && r.URL.Path != "" {
			// API redirect: include the canonical slug for the client. We don't
			// 301 here because clients may not preserve method/body on redirect.
			writeJSON(w, http.StatusGone, map[string]any{
				"error":          "slug retired",
				"canonical_slug": redirect,
			})
			return
		}
		ctx := context.WithValue(r.Context(), eventCtxKey, e)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireCode enforces the X-Event-Code header (or ?code= query param) match.
func (s *Server) requireCode(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		e := eventFromCtx(r)
		if e == nil {
			writeError(w, http.StatusInternalServerError, "event not loaded")
			return
		}
		code := r.Header.Get("X-Event-Code")
		if code == "" {
			code = r.URL.Query().Get("code")
		}
		if code == "" {
			writeError(w, http.StatusUnauthorized, "event code required")
			return
		}
		if subtle.ConstantTimeCompare([]byte(code), []byte(e.Code)) != 1 {
			writeError(w, http.StatusUnauthorized, "wrong event code")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireUnlocked rejects mutations when the event is locked-effective.
// Apply only to mutating handlers (PUT/DELETE/POST).
func (s *Server) requireUnlocked(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		e := eventFromCtx(r)
		if e == nil {
			writeError(w, http.StatusInternalServerError, "event not loaded")
			return
		}
		if e.LockedEffective(time.Now()) {
			writeError(w, http.StatusForbidden, "event is locked")
			return
		}
		next.ServeHTTP(w, r)
	})
}
