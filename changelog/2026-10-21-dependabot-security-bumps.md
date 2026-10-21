# Dependabot security bumps (react-router, dompurify, x/net, vite)

**Date:** 2026-10-21
**Type:** infra
**Version:** v0.1.2
**Author:** claude-code

## What changed

- Runtime: `react-router-dom` 7.15 -> 7.18.4, `dompurify` 3.4.5 -> 3.4.17 (both bundled
  into the SPA), `golang.org/x/net` v0.26.0 -> v0.61.0 (server-side, via bluemonday).
- Dev/build: `vite` 8.0 -> 8.3.5, plus lockfile refreshes of postcss, browserslist,
  source-map-js, brace-expansion, baseline-browser-mapping and @babel/core.
- Go builder `golang:1.25-alpine` -> `golang:1.26-alpine`. x/net v0.61 requires go 1.26,
  so the `go` directive moved to 1.26.0 too.

## Why

Dependabot was enabled on the deployed repos and rsvp had 34 open alerts (high:
react-router x2, vite x2, postcss, browserslist, source-map-js, brace-expansion).
rsvp is public, so it was worth reading which ones actually reached the deployed app:

- **react-router**: the app is a client-only `BrowserRouter` SPA. The RSC CSRF, SSR
  hydration, RSCErrorHandler and route-matching DoS advisories are server-rendering
  paths that do not exist here. The backslash open-redirect in `<Link>`/`useNavigate`
  is client-side and nominally reachable, though nothing navigates to user-supplied paths.
- **dompurify**: used once, in `web/src/lib/markdown.ts`, as a string-mode `sanitize()`
  for the manager's live preview. Every advisory is about `IN_PLACE`, `setConfig`,
  hooks, Trusted Types or custom elements - none are used. Not reachable.
- **x/net**: `golang.org/x/net/html` is reached through bluemonday when the server
  renders event markdown. The HTML-parser DoS is reachable in principle, but the input
  is host-written (manager-gated), not guest-written. The other two x/net advisories
  (proxy bypass, XSS in a different package) are not on the import path.
- **vite / postcss / browserslist / source-map-js / brace-expansion / babel**: dev
  server and build tooling only; the shipped image contains the built static bundle.

Bumped everything anyway since every bump was compatible and the build passed.

## Related

- fisherevans/nottingham-cloud#800
