package api

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"

	"github.com/fisherevans/rsvp/internal/auth"
)

type loginReq struct {
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if subtle.ConstantTimeCompare([]byte(req.Password), []byte(s.cfg.ManagementPassword)) != 1 {
		writeError(w, http.StatusUnauthorized, "wrong password")
		return
	}
	auth.SetCookie(w, auth.Mint(s.cfg.SessionSecret), !s.cfg.DevMode)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	auth.ClearCookie(w, !s.cfg.DevMode)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	// requireManager already validated by middleware
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
}

// requireManager is middleware: 401 unless a valid session cookie is present.
func (s *Server) requireManager(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(auth.CookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "not logged in")
			return
		}
		if err := auth.Verify(s.cfg.SessionSecret, c.Value); err != nil {
			writeError(w, http.StatusUnauthorized, "session invalid: "+err.Error())
			return
		}
		next.ServeHTTP(w, r)
	})
}
