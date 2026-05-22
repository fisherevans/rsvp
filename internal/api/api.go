// Package api is the HTTP layer. Routes are declared in router.go; handlers
// live in their own files grouped by resource. The router serves both the
// JSON API under /api/* and (in prod builds) the embedded SPA under /*.
package api

import (
	"io/fs"
	"log/slog"
	"net/http"

	"github.com/fisherevans/rsvp/internal/config"
	"github.com/fisherevans/rsvp/internal/db"
)

type Server struct {
	cfg    *config.Config
	store  *db.Store
	logger *slog.Logger
	spaFS  fs.FS // nil in dev (Vite handles SPA); populated in -tags embed_spa builds
	mux    http.Handler
}

// New wires the HTTP server. spaFS, when non-nil, is the embedded Vite build
// served as the catch-all for non-API routes. In dev builds it's nil and
// only /api, /event/<slug>, and /uploads are handled here.
func New(cfg *config.Config, store *db.Store, logger *slog.Logger, spaFS fs.FS) http.Handler {
	s := &Server{cfg: cfg, store: store, logger: logger, spaFS: spaFS}
	s.mux = s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
