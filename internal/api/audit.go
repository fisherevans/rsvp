package api

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strconv"

	"github.com/fisherevans/rsvp/internal/db"
	"github.com/fisherevans/rsvp/internal/util"
)

// handleListAudit returns the most recent audit_log entries, optionally
// filtered. Manager session required.
func (s *Server) handleListAudit(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	rows, err := s.store.ListAudit(r.Context(), db.AuditFilters{
		EventID:  q.Get("event_id"),
		Action:   q.Get("action"),
		SourceIP: q.Get("source_ip"),
		Limit:    limit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []db.AuditRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": rows})
}

// audit writes one audit_log entry. Best-effort: failures are logged but
// never fail the surrounding handler. The chi RealIP middleware has already
// rewritten r.RemoteAddr to honor X-Forwarded-For when present.
func (s *Server) audit(ctx context.Context, r *http.Request, eventID, action, targetID string, payload any) {
	blob, err := json.Marshal(payload)
	if err != nil {
		blob = []byte(`{}`)
	}
	entry := db.AuditEntry{
		ID:        util.NewID(),
		EventID:   eventID,
		Action:    action,
		TargetID:  targetID,
		Payload:   string(blob),
		SourceIP:  clientIP(r),
		UserAgent: r.UserAgent(),
	}
	if err := s.store.InsertAudit(ctx, entry); err != nil {
		s.logger.Error("audit insert failed", "err", err, "action", action, "target", targetID)
	}
}

func clientIP(r *http.Request) string {
	addr := r.RemoteAddr
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}
