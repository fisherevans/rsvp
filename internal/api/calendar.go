package api

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/fisherevans/rsvp/internal/db"
	"github.com/fisherevans/rsvp/internal/render"
)

// handleCalendar returns a single-event .ics file. RFC 5545.
//
// Calendar apps fetch this via URL and don't set custom headers, so the code
// gate accepts ?code= in the query string (handled by requireCode middleware).
func (s *Server) handleCalendar(w http.ResponseWriter, r *http.Request) {
	e := eventFromCtx(r)
	ics := buildICS(e, s.cfg.PublicBaseURL)
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+e.Slug+`.ics"`)
	_, _ = w.Write(ics)
}

func buildICS(e *db.Event, publicBaseURL string) []byte {
	desc := render.PlainText(e.DetailsMD, 1000)
	now := time.Now().UTC()
	tzLoc, err := time.LoadLocation(e.Timezone)
	if err != nil || tzLoc == nil {
		tzLoc = time.UTC
	}

	url := fmt.Sprintf("%s/event/%s?code=%s", strings.TrimRight(publicBaseURL, "/"), e.Slug, e.Code)

	var buf bytes.Buffer
	w := func(line string) {
		buf.WriteString(foldLine(line))
		buf.WriteString("\r\n")
	}

	w("BEGIN:VCALENDAR")
	w("VERSION:2.0")
	w("PRODID:-//rsvp.fisher.sh//EN")
	w("CALSCALE:GREGORIAN")
	w("METHOD:PUBLISH")
	w("BEGIN:VEVENT")
	w("UID:" + e.ID + "@rsvp.fisher.sh")
	w("DTSTAMP:" + now.Format("20060102T150405Z"))

	if e.AllDay {
		// All-day events use DATE values in the event's local tz. The end
		// date is exclusive per RFC 5545 - if we display "May 23 to May 26",
		// DTEND should be May 27. Always bump by one day from the stored end
		// (which is the last day of the event).
		startLocal := e.StartsAt.In(tzLoc)
		endLocalExclusive := e.EndsAt.In(tzLoc).AddDate(0, 0, 1)
		w("DTSTART;VALUE=DATE:" + startLocal.Format("20060102"))
		w("DTEND;VALUE=DATE:" + endLocalExclusive.Format("20060102"))
	} else {
		// Timed: emit UTC instants. Calendar apps render in the user's tz.
		w("DTSTART:" + e.StartsAt.UTC().Format("20060102T150405Z"))
		w("DTEND:" + e.EndsAt.UTC().Format("20060102T150405Z"))
	}

	w("SUMMARY:" + escapeText(e.Name))
	if desc != "" {
		w("DESCRIPTION:" + escapeText(desc))
	}
	if loc := formatLocation(e); loc != "" {
		w("LOCATION:" + escapeText(loc))
	}
	w("URL:" + url)
	w("END:VEVENT")
	w("END:VCALENDAR")
	return buf.Bytes()
}

// escapeText escapes commas, semicolons, backslashes, and newlines per RFC 5545.
func escapeText(s string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`;`, `\;`,
		`,`, `\,`,
		"\n", `\n`,
		"\r", "",
	)
	return r.Replace(s)
}

// formatLocation prefers "Label - Address" when both are set; otherwise
// whichever single one is present. Empty when both are nil.
func formatLocation(e *db.Event) string {
	addr := ""
	if e.Address != nil {
		addr = strings.TrimSpace(*e.Address)
	}
	label := ""
	if e.AddressLabel != nil {
		label = strings.TrimSpace(*e.AddressLabel)
	}
	switch {
	case label != "" && addr != "":
		return label + " - " + addr
	case label != "":
		return label
	default:
		return addr
	}
}

// foldLine wraps long lines at 75 octets per RFC 5545 with CRLF + space.
func foldLine(line string) string {
	const limit = 75
	if len(line) <= limit {
		return line
	}
	var out strings.Builder
	for i, b := range []byte(line) {
		if i > 0 && i%limit == 0 {
			out.WriteString("\r\n ")
		}
		out.WriteByte(b)
	}
	return out.String()
}
