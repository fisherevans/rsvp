//go:build embed_spa

// Package spa holds the embedded Vite-built SPA. Only present in builds made
// with the `embed_spa` build tag; in default dev builds this file is excluded
// so the absence of internal/spa/dist doesn't break compilation.
package spa

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var files embed.FS

// FS returns the SPA bundle (web/dist contents, rooted at the bundle's top
// level so reads look like fs.ReadFile(FS(), "index.html")).
func FS() fs.FS {
	sub, err := fs.Sub(files, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
