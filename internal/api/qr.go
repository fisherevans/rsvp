package api

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

// handleQR renders a QR code for the share URL of this event. ETag-keyed on
// (slug, code, include_code) so the browser can reuse it; if any of those
// change the ETag does too.
//
// ?include_code=0 omits ?code= from the encoded URL - useful when sharing in
// a semi-public channel where guests are expected to type the code.
func (s *Server) handleQR(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	includeCode := r.URL.Query().Get("include_code") != "0"
	base := strings.TrimRight(s.cfg.PublicBaseURL, "/")
	var shareURL string
	if includeCode {
		shareURL = fmt.Sprintf("%s/event/%s?code=%s", base, e.Slug, e.Code)
	} else {
		shareURL = fmt.Sprintf("%s/event/%s", base, e.Slug)
	}

	etagKey := e.Slug + "\x00" + e.Code
	if !includeCode {
		etagKey += "\x00nocode"
	}
	etag := `"` + qrETagFromKey(etagKey) + `"`
	if match := r.Header.Get("If-None-Match"); match == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	png, err := qrcode.Encode(shareURL, qrcode.Medium, 512)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = w.Write(png)
}

func qrETagFromKey(key string) string {
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:8])
}
