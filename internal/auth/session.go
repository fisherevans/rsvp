// Package auth handles the management session cookie.
//
// There's only one shared management user, so the session payload doesn't
// carry an identity. It carries an expiry stamp, signed with HMAC-SHA256
// using the server's session secret. Format:
//
//	rsvp_session = base64url(unix_expires) "." base64url(hmac)
//
// On every request the middleware re-derives the HMAC and compares it in
// constant time, then checks the expiry. No server-side session store.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	CookieName = "rsvp_session"
	cookieTTL  = 30 * 24 * time.Hour
)

func sign(secret string, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Mint produces a cookie value good for cookieTTL.
func Mint(secret string) string {
	exp := time.Now().Add(cookieTTL).Unix()
	payload := base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(exp, 10)))
	return payload + "." + sign(secret, payload)
}

// Verify returns nil iff the cookie value is well-formed, signed by secret,
// and not expired.
func Verify(secret, value string) error {
	parts := strings.SplitN(value, ".", 2)
	if len(parts) != 2 {
		return errors.New("malformed")
	}
	expected := sign(secret, parts[0])
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return errors.New("bad signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return errors.New("bad payload")
	}
	exp, err := strconv.ParseInt(string(raw), 10, 64)
	if err != nil {
		return errors.New("bad expiry")
	}
	if time.Now().Unix() > exp {
		return errors.New("expired")
	}
	return nil
}

// SetCookie writes the session cookie on the response.
func SetCookie(w http.ResponseWriter, value string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(cookieTTL / time.Second),
	})
}

// ClearCookie expires the session cookie.
func ClearCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
