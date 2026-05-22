//go:build embed_spa

package main

import "github.com/fisherevans/rsvp/internal/spa"

func init() {
	spaFS = spa.FS()
}
