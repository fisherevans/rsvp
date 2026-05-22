package api

import (
	"errors"
	"fmt"
	"html"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/fisherevans/rsvp/internal/db"
	"github.com/fisherevans/rsvp/internal/render"
	"github.com/go-chi/chi/v5"
)

// indexHTMLDevPath is where the Go server reads index.html from in dev mode
// (Vite's source HTML). In prod, the embedded web/dist/index.html (built by
// Vite) is read from spaFS instead.
const indexHTMLDevPath = "web/index.html"

// readIndexHTML returns the index.html body the OG handler injects into.
// In prod (spaFS populated) it reads from the embedded FS. In dev it reads
// from disk so iterating on the SPA shell doesn't require a rebuild.
func (s *Server) readIndexHTML() ([]byte, error) {
	if s.spaFS != nil {
		return fs.ReadFile(s.spaFS, "index.html")
	}
	return os.ReadFile(indexHTMLDevPath)
}

// handleEventPage serves the SPA index for /event/<slug>, with Open Graph
// + Twitter Card meta tags injected so messaging apps render a preview.
//
// No code is required: OG previews work on any link the host shares. The
// SPA itself (loaded after) still gates the event behind the code.
//
// Slug history: if the slug is retired, we 301 to the current slug to keep
// scrapers and humans on the canonical URL.
func (s *Server) handleEventPage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	e, redirect, err := s.store.LookupEvent(r.Context(), slug)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if redirect != "" {
		target := "/event/" + redirect
		if q := r.URL.RawQuery; q != "" {
			target += "?" + q
		}
		http.Redirect(w, r, target, http.StatusMovedPermanently)
		return
	}

	indexHTML, err := s.readIndexHTML()
	if err != nil {
		http.Error(w, "index template missing: "+err.Error(), http.StatusInternalServerError)
		return
	}

	tags := buildOGTags(e, s.cfg.PublicBaseURL, r.URL.RawQuery)
	out := injectIntoHead(string(indexHTML), tags)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write([]byte(out))
}

// buildOGTags assembles the head fragment with all OG + Twitter meta tags.
func buildOGTags(e *db.Event, publicBaseURL, query string) string {
	loc, err := time.LoadLocation(e.Timezone)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	var when string
	if e.AllDay {
		when = formatAllDay(e.StartsAt.In(loc), e.EndsAt.In(loc))
	} else {
		when = formatEventWhen(e.StartsAt.In(loc), e.EndsAt.In(loc))
	}

	description := ""
	if e.Summary != nil && *e.Summary != "" {
		description = *e.Summary
	} else {
		description = when
		if loc := eventLocationLabel(e); loc != "" {
			description += " - " + loc
		}
		if details := render.PlainText(e.DetailsMD, 180); details != "" {
			description += ". " + details
		}
	}

	imageURL := ""
	if e.PosterImage != nil && *e.PosterImage != "" {
		imageURL = absolutize(publicBaseURL, *e.PosterImage)
	} else if e.ThemeHeaderImage != nil && *e.ThemeHeaderImage != "" {
		imageURL = absolutize(publicBaseURL, *e.ThemeHeaderImage)
	}

	pageURL := strings.TrimRight(publicBaseURL, "/") + "/event/" + e.Slug
	if query != "" {
		pageURL += "?" + query
	}

	var b strings.Builder
	addMeta := func(prop, value string) {
		if value == "" {
			return
		}
		b.WriteString(`    <meta property="`)
		b.WriteString(html.EscapeString(prop))
		b.WriteString(`" content="`)
		b.WriteString(html.EscapeString(value))
		b.WriteString("\">\n")
	}
	addName := func(name, value string) {
		if value == "" {
			return
		}
		b.WriteString(`    <meta name="`)
		b.WriteString(html.EscapeString(name))
		b.WriteString(`" content="`)
		b.WriteString(html.EscapeString(value))
		b.WriteString("\">\n")
	}

	addMeta("og:type", "event")
	addMeta("og:title", e.Name)
	addMeta("og:description", description)
	addMeta("og:url", pageURL)
	if imageURL != "" {
		addMeta("og:image", imageURL)
		addName("twitter:card", "summary_large_image")
	} else {
		addName("twitter:card", "summary")
	}
	addName("twitter:title", e.Name)
	addName("twitter:description", description)
	if imageURL != "" {
		addName("twitter:image", imageURL)
	}
	// Replace the SPA's generic <title>.
	b.WriteString(`    <title>`)
	b.WriteString(html.EscapeString(e.Name))
	b.WriteString("</title>\n")
	return b.String()
}

// injectIntoHead inserts content right before </head>. Falls back to the
// original document if there's no </head> tag.
func injectIntoHead(doc, content string) string {
	const marker = "</head>"
	idx := strings.Index(doc, marker)
	if idx < 0 {
		return doc
	}
	return doc[:idx] + content + doc[idx:]
}

// absolutize turns a relative URL (e.g. /uploads/foo.png) into an absolute one
// using PublicBaseURL. Already-absolute URLs pass through.
func absolutize(base, p string) string {
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
		return p
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.TrimRight(base, "/") + p
}

// formatAllDay produces a date-only description: "Saturday, May 22 2026" for
// a single-day event, or "May 22 - May 24 2026" for multi-day.
func formatAllDay(start, end time.Time) string {
	sameDay := start.Year() == end.Year() && start.YearDay() == end.YearDay()
	if sameDay {
		return fmt.Sprintf("%s, %s %d %d",
			start.Format("Mon"), start.Format("Jan"), start.Day(), start.Year())
	}
	if start.Year() == end.Year() {
		return fmt.Sprintf("%s %d - %s %d %d",
			start.Format("Jan"), start.Day(),
			end.Format("Jan"), end.Day(), end.Year())
	}
	return fmt.Sprintf("%s %d %d - %s %d %d",
		start.Format("Jan"), start.Day(), start.Year(),
		end.Format("Jan"), end.Day(), end.Year())
}

// eventLocationLabel returns the friendly address label if set, else the raw
// address. Used in OG description so previews show "Fisher's home" not
// "27 Aspen Dr, Madison".
func eventLocationLabel(e *db.Event) string {
	if e.AddressLabel != nil {
		s := strings.TrimSpace(*e.AddressLabel)
		if s != "" {
			return s
		}
	}
	if e.Address != nil {
		return strings.TrimSpace(*e.Address)
	}
	return ""
}

// formatEventWhen renders the start/end as a single human-readable string in
// the event's local time. Examples:
//
//	"Sat, Dec 12 2026, 7:00 PM - 11:00 PM CST"          (same day)
//	"Sat, Dec 12 7:00 PM - Sun, Dec 13 2026, 1:00 AM CST" (overnight)
//	"Fri, May 22 - Sun, May 24 2026"                     (multi-day all-day)
//
// We always include the timezone abbreviation so the reader knows what local
// means relative to them.
func formatEventWhen(start, end time.Time) string {
	tz, _ := start.Zone()
	sameDay := start.Year() == end.Year() && start.YearDay() == end.YearDay()
	if sameDay {
		return fmt.Sprintf("%s, %s %d %d, %s - %s %s",
			start.Format("Mon"), start.Format("Jan"), start.Day(), start.Year(),
			start.Format("3:04 PM"), end.Format("3:04 PM"), tz)
	}
	return fmt.Sprintf("%s, %s %d %s - %s, %s %d %d, %s %s",
		start.Format("Mon"), start.Format("Jan"), start.Day(), start.Format("3:04 PM"),
		end.Format("Mon"), end.Format("Jan"), end.Day(), end.Year(), end.Format("3:04 PM"), tz)
}
