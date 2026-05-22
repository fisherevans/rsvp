// Package config loads runtime config from environment variables. All fields
// have sensible local-dev defaults; production overrides via env.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
)

type Config struct {
	Addr               string
	DBPath             string
	UploadsDir         string
	ManagementPassword string
	SessionSecret      string
	PublicBaseURL      string // e.g. http://localhost:5173 in dev, https://rsvp.fisher.sh in prod
	DevMode            bool
}

func Load() (*Config, error) {
	c := &Config{
		Addr:               envOr("RSVP_ADDR", ":8088"),
		DBPath:             envOr("RSVP_DB_PATH", "./data/rsvp.db"),
		UploadsDir:         envOr("RSVP_UPLOADS_DIR", "./data/uploads"),
		ManagementPassword: os.Getenv("RSVP_MANAGEMENT_PASSWORD"),
		SessionSecret:      os.Getenv("RSVP_SESSION_SECRET"),
		PublicBaseURL:      envOr("RSVP_PUBLIC_BASE_URL", "http://localhost:5173"),
		DevMode:            envOr("RSVP_DEV", "true") == "true",
	}

	if c.ManagementPassword == "" {
		if !c.DevMode {
			return nil, errors.New("RSVP_MANAGEMENT_PASSWORD is required outside dev mode")
		}
		c.ManagementPassword = "rsvp-dev"
	}
	if c.SessionSecret == "" {
		if !c.DevMode {
			return nil, errors.New("RSVP_SESSION_SECRET is required outside dev mode")
		}
		buf := make([]byte, 32)
		_, _ = rand.Read(buf)
		c.SessionSecret = hex.EncodeToString(buf)
	}

	if err := os.MkdirAll(filepath.Dir(c.DBPath), 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(c.UploadsDir, 0o755); err != nil {
		return nil, err
	}
	return c, nil
}

func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
