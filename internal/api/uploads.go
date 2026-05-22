package api

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fisherevans/rsvp/internal/db"
	"github.com/fisherevans/rsvp/internal/util"
	"github.com/go-chi/chi/v5"
)

const maxUploadBytes = 25 << 20 // 25 MiB - room for phone photos

var allowedMIME = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	t0 := time.Now()
	slug := chi.URLParam(r, "slug")
	defer func() {
		slog.Info("upload done", "slug", slug, "elapsed_ms", time.Since(t0).Milliseconds())
	}()

	event, err := s.store.GetEventBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+512)
	if err := r.ParseMultipartForm(maxUploadBytes + 512); err != nil {
		writeError(w, http.StatusBadRequest, "multipart parse: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing 'file' field: "+err.Error())
		return
	}
	defer file.Close()

	if header.Size > maxUploadBytes {
		writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large (max %d bytes)", maxUploadBytes))
		return
	}

	// Sniff content type from the first 512 bytes; trust the file, not the header.
	sniffBuf := make([]byte, 512)
	n, _ := io.ReadFull(file, sniffBuf)
	sniffBuf = sniffBuf[:n]
	mime := http.DetectContentType(sniffBuf)
	ext, ok := allowedMIME[mime]
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported file type: "+mime)
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeError(w, http.StatusInternalServerError, "rewind: "+err.Error())
		return
	}

	id := util.NewID()
	relDir := event.ID
	absDir := filepath.Join(s.cfg.UploadsDir, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	filename := id + ext
	absPath := filepath.Join(absDir, filename)

	out, err := os.Create(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer out.Close()

	written, err := io.Copy(out, file)
	if err != nil {
		_ = os.Remove(absPath)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	originalName := strings.TrimSpace(header.Filename)
	if originalName == "" {
		originalName = filename
	}

	_, err = s.store.DB.ExecContext(r.Context(), `
        INSERT INTO uploads (id, event_id, filename, mime_type, size_bytes, path)
        VALUES (?, ?, ?, ?, ?, ?)`,
		id, event.ID, originalName, mime, written, filepath.Join(relDir, filename))
	if err != nil {
		_ = os.Remove(absPath)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	publicURL := "/uploads/" + relDir + "/" + filename
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":         id,
		"url":        publicURL,
		"mime_type":  mime,
		"size_bytes": written,
	})
}
