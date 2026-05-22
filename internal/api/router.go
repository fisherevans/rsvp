package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func (s *Server) routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Auth: login + logout are open. Everything else under /api/manage is gated.
	r.Post("/api/manage/login", s.handleLogin)
	r.Post("/api/manage/logout", s.handleLogout)

	r.Route("/api/manage", func(r chi.Router) {
		r.Use(s.requireManager)
		r.Get("/me", s.handleMe)

		r.Get("/events", s.handleListEvents)
		r.Post("/events", s.handleCreateEvent)
		r.Get("/event/{slug}", s.handleGetMgmtEvent)
		r.Patch("/event/{slug}", s.handlePatchEvent)
		r.Delete("/event/{slug}", s.handleDeleteEvent)
		r.Post("/event/{slug}/lock", s.handleLock)
		r.Post("/event/{slug}/unlock", s.handleUnlock)
		r.Post("/event/{slug}/regenerate-code", s.handleRegenerateCode)
		r.Post("/event/{slug}/upload", s.handleUpload)

		r.Get("/audit", s.handleListAudit)
	})

	// Static uploads. Read-only; created by the upload handler above.
	uploads := http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadsDir)))
	r.Handle("/uploads/*", uploads)

	// HTML page for /event/<slug>: serves SPA index with Open Graph meta tags
	// injected so messaging apps render link previews. Public, no code needed
	// (the OG metadata - title, summary, poster - is meant to be shared).
	r.Get("/event/{slug}", s.handleEventPage)

	// Public event endpoints. withEvent loads + redirects through slug history;
	// requireCode validates the X-Event-Code header / ?code= query param;
	// requireUnlocked rejects mutations when the event is past end time or
	// manually locked.
	r.Route("/api/event/{slug}", func(r chi.Router) {
		r.Use(s.withEvent)

		// Public preview - same surface as the OG meta tags, no code needed.
		// Used by the code-gate landing page to show the event name + theme
		// before the user has typed the code.
		r.Get("/preview", s.handleGetPublicPreview)

		// Everything else is code-gated.
		r.Group(func(r chi.Router) {
			r.Use(s.requireCode)

			r.Get("/", s.handleGetPublicEvent)
			r.Get("/calendar.ics", s.handleCalendar)
			r.Get("/qr.png", s.handleQR)
			r.Put("/attendee", chainMiddleware(s.requireUnlocked, http.HandlerFunc(s.handlePutAttendee)))
			r.Delete("/attendee/{id}", chainMiddleware(s.requireUnlocked, http.HandlerFunc(s.handleDeleteAttendee)))
			r.Put("/response", chainMiddleware(s.requireUnlocked, http.HandlerFunc(s.handlePutResponse)))
			r.Delete("/response/{id}", chainMiddleware(s.requireUnlocked, http.HandlerFunc(s.handleDeleteResponse)))
		})
	})

	// SPA catch-all. Only registered in prod builds (-tags embed_spa). In dev
	// Vite serves the frontend on its own port and we never reach this.
	if s.spaFS != nil {
		r.Handle("/*", spaHandler(s.spaFS))
	}

	return r
}

// chainMiddleware wraps a handler with one extra middleware. Used for the
// few public mutating endpoints that need requireUnlocked layered on top of
// the route-level chain.
func chainMiddleware(mw func(http.Handler) http.Handler, h http.Handler) http.HandlerFunc {
	return mw(h).ServeHTTP
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
