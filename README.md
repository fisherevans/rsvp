# rsvp

Code-gated event pages for the events I throw with my wife. RSVP, attendee management, shared management portal, .ics + Google Calendar deep links, QR share, OG link previews, audit log.

Single Go binary serving the API + the embedded React SPA. SQLite + uploads on one volume. No external DB, no object storage.

## Local dev

```sh
make dev      # API on :8088, Vite on :5173 with proxy
make smoke    # resets DB and exercises every endpoint
```

Open `http://localhost:5173/manage`. Default password in dev: `rsvp-dev`.

Env overrides: `RSVP_ADDR`, `RSVP_DB_PATH`, `RSVP_UPLOADS_DIR`, `RSVP_MANAGEMENT_PASSWORD`, `RSVP_SESSION_SECRET`, `RSVP_PUBLIC_BASE_URL`, `RSVP_DEV`.

The Makefile sets `GOWORK=off` because `~/dev/go.work` is for other projects.

## Build for production

```sh
make build    # web/dist into internal/spa/dist, then go build -tags embed_spa
```

Produces `bin/rsvp`: a single static binary with the SPA embedded. Listens on `:8088`. SQLite + uploads under `/data/` by default.

## Layout

```
cmd/rsvp/          entrypoint + build-tag wiring for the SPA embed
internal/api/      HTTP handlers (chi)
internal/db/       SQLite store + migrations + idempotent ensureSchema
internal/spa/      embedded Vite bundle (only present in -tags embed_spa builds)
internal/render/   markdown -> sanitized HTML
internal/util/     small helpers (slug, ID, code generation)
web/               Vite + React app
deploy/            k3s manifest templates (see deploy/README.md)
scripts/           dev.sh, smoke.sh
```

## Deploy

See `deploy/README.md`. Targets k3s with NFS-backed PVCs, Caddy + Cloudflare Tunnel ingress. Single-replica `Recreate` strategy (SQLite is single-writer); PVC reclaim is `Retain` so data survives bad days.

## Notes

`CLAUDE.md` is the in-repo agent context map - schema iteration rules, button class system, build tag conventions, known constraints.
