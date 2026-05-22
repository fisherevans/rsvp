package api

import (
	"io/fs"
	"net/http"
	"strings"
)

// spaHandler serves the Vite-built SPA from an embedded filesystem.
//
// Two behaviors:
//   - existing static asset (e.g. /assets/index-abc.js, /favicon.svg) -> serve directly
//   - anything else -> serve index.html so client-side routing (React Router)
//     resolves the deep link in the browser
//
// Used as the catch-all for routes the chi router doesn't otherwise match.
// In dev (spaFS nil) this is never registered.
func spaHandler(spaFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(spaFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(spaFS, path); err != nil {
			// Not an actual asset - return index.html so React Router can resolve.
			r.URL.Path = "/"
			r.URL.RawPath = ""
		}
		// Vite's bundle filenames are content-hashed, so cache aggressively
		// for hashed assets. index.html stays no-cache so deploys take.
		if strings.HasPrefix(path, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})
}
