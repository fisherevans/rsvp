# syntax=docker/dockerfile:1.7

# --- Stage 1: build the Vite SPA ---
# Vite's outDir is ../internal/spa/dist (relative to web/), so the SPA build
# writes into /build/internal/spa/dist where stage 2 picks it up.
FROM node:24-alpine AS web
WORKDIR /build

# Copy package metadata first to maximize layer caching for `npm ci`.
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci

# Copy the rest of the web sources + the host paths Vite's outDir refers to
# (internal/spa/ is the embed target).
COPY web/ web/
RUN mkdir -p internal/spa && cd web && npm run build

# --- Stage 2: build the Go binary with the SPA embedded ---
FROM golang:1.26-alpine AS go
WORKDIR /build

# Module cache layer.
COPY go.mod go.sum ./
RUN go mod download

# Bring in everything we need from the host + the freshly-built SPA bundle
# from stage 1.
COPY cmd/ cmd/
COPY internal/ internal/
COPY --from=web /build/internal/spa/dist internal/spa/dist

# Pure-Go build: modernc.org/sqlite has no cgo dependency, so we can build a
# fully static binary suitable for distroless. -tags embed_spa flips on the
# embed.FS that pulls internal/spa/dist into the binary. -ldflags trim debug
# info; -trimpath strips local paths.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -tags embed_spa -trimpath -ldflags '-s -w' -o /rsvp ./cmd/rsvp

# --- Stage 3: minimal runtime ---
# Distroless static: no shell, no package manager, no extras. Just glibc +
# the binary. Smaller attack surface.
FROM gcr.io/distroless/static-debian13:nonroot
WORKDIR /
COPY --from=go /rsvp /rsvp

# /data is where SQLite + uploads live. The k8s PVC mounts here.
VOLUME ["/data"]
EXPOSE 8088

# Reasonable prod defaults. The k8s manifest overrides RSVP_PUBLIC_BASE_URL
# and provides the password + session secret via a Secret.
ENV RSVP_ADDR=":8088" \
    RSVP_DB_PATH="/data/rsvp.db" \
    RSVP_UPLOADS_DIR="/data/uploads" \
    RSVP_DEV="false"

USER nonroot:nonroot
ENTRYPOINT ["/rsvp"]
