# rsvp - agent context map

You are working in a personal RSVP web app. Single-binary Go server with an
embedded React SPA, backed by SQLite on an NFS-backed PVC.

## Where things live

| If the task is about... | Look at |
| --- | --- |
| HTTP routes | `internal/api/router.go` |
| Database schema | `internal/db/migrations/001_init.sql` + `internal/db/ensure.go` |
| Per-event code gate | `internal/api/middleware_event.go` |
| OG link previews / `/event/<slug>` HTML | `internal/api/og.go` |
| SPA serving in prod | `internal/api/spa.go` + `internal/spa/` |
| Frontend pages | `web/src/pages/` (ManageList, ManageEvent, NewEventPage, AuditPage, EventPage) |
| Reusable frontend components | `web/src/components/` |
| Theming + brutalist style | `web/src/App.css` and `index.html` Google Fonts link |
| Deploy manifests | `deploy/` |
| Operations / upgrade story | `deploy/README.md` |

## House rules

### Dev workflow

- `make dev` runs both API + Vite. `make smoke` resets the DB and exercises every public + mgmt endpoint via curl.
- `GOWORK=off` is set in the Makefile because `~/dev/go.work` is for other projects.
- Use the dedicated tools when you can: `Read` for known paths, `grep` via Bash for symbols. Don't shell out to `cat`/`sed`/`echo`.

### Schema iteration

I used to edit `001_init.sql` in place during early iteration, which silently broke existing DBs (the migration runner only re-runs new files). The current rule:

- **Adding a new column or index?** Add it to both `001_init.sql` AND `internal/db/ensure.go`'s `required` list. `ensureSchema` runs on every startup and adds any missing columns via `ALTER TABLE ADD COLUMN`. Idempotent - safe for both fresh and existing DBs.
- **Renaming / changing a column?** Write a new numbered migration file (`002_*.sql`, etc). Don't edit `001`.
- **Data migrations?** Same - new numbered file.

Never delete `data/rsvp.db` to "fix" a schema issue. That's a sign `ensureSchema` is missing the column.

### Build tags

- Default `go build ./cmd/rsvp` makes a dev binary that doesn't embed the SPA. Vite serves the frontend on its own port.
- `go build -tags embed_spa ./cmd/rsvp` (the Dockerfile does this) embeds `internal/spa/dist` into the binary. Vite must have built into `internal/spa/dist` first via `npm run build`.
- The build-tagged file `internal/spa/spa.go` and `cmd/rsvp/spa_embed.go` are the only files that need the `//go:build embed_spa` directive.

### Auth + sessions

- `/api/manage/*` is gated by `s.requireManager` middleware that checks the `rsvp_session` cookie.
- The session cookie is `base64(unix_expires).hmac` signed with `RSVP_SESSION_SECRET`. Rotating the secret invalidates all sessions.
- `/api/event/<slug>/*` is gated by the per-event code in the `X-Event-Code` header or `?code=` query param. `requireUnlocked` is layered on top of mutating routes (returns 403 once the event ends or `locked=true`).
- `/api/event/<slug>/preview` is the only event endpoint that's public (no code) - it returns the same minimal info that's already exposed via OG meta tags. The code-gate landing page uses it to show the event name before the user types the code.

### Audit log

Every public mutation (`PUT /attendee`, `DELETE /attendee/{id}`, `PUT /response`, `DELETE /response/{id}`) writes a row to `audit_log` via `s.audit(...)` from `internal/api/audit.go`. Payload is a JSON snapshot including `before` and/or `after` state. `source_ip` comes from chi's `RealIP` middleware.

Audit is read-only via `/api/manage/audit` (and the `/manage/audit` page). No UI for revert.

### Visual style

Neobrutalist:

- **Outfit** font everywhere; headings are 900-weight uppercase with tight letter-spacing.
- 2px ink borders on cards, buttons, inputs.
- Hard offset shadow `4px 4px 0 0 #111` (no blur) on cards + buttons. Buttons "press down" on hover (translate + shrink the shadow).
- Red accent `#e63946` is the default; per-event theming overrides via `--accent` CSS var.
- Custom Bauhaus-style checkboxes / radios via `appearance: none` + drawn checkmark / dot.

Per-event content lives inside `.event-themed`. Inside that scope, heading transforms (uppercase) are removed so script fonts like Pacifico render naturally, and the per-event `--accent`, `--title-font`, `--title-scale`, `--text-scale` CSS vars take over.

### Buttons

Three escape-hatch classes for buttons that should NOT inherit the brutalist treatment:

- `.btn-link` - looks like an underlined text link (used for inline toggles)
- `.btn-bare` - strips all global styling (use when inline styles fully own the look)
- `.btn-quiet` - text-only, used inside composite widgets (stepper carets, etc.)

A fourth: `.btn-small` for compact list-row affordances (smaller padding, font, shadow).

### Known constraints

- **Native file pickers don't always open on macOS** (browser issue, not our code). `ImageSlot` supports drag-and-drop as the reliable path.
- **Single-writer SQLite.** Deployment is single-replica with `Recreate` strategy. Don't change.
- **The Vite dev server doesn't inject OG tags** - only the Go server does (because it serves `/event/<slug>` HTML directly). To test OG previews locally, build with `make build` and hit `localhost:8088`.

## Stance: this repo ships when it builds + smokes

Both must pass:

```sh
make build           # produces bin/rsvp with the SPA embedded
make smoke           # resets DB + exercises every endpoint
```

If you change schema, you must also update `ensure.go`. If you add a new route or middleware, run `make smoke` to confirm nothing regressed.
