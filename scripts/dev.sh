#!/usr/bin/env bash
# Run the Go API and the Vite dev server side by side. Output is interleaved
# with [api] / [web] prefixes so both feel like one log stream. Ctrl+C kills
# both cleanly.
#
# Usage: scripts/dev.sh   (or `make dev`)

set -uo pipefail

cd "$(dirname "$0")/.."

mkdir -p data

GOWORK=off

# Color codes only show up if stdout is a tty.
if [ -t 1 ]; then
    GREEN=$'\033[32m'
    BLUE=$'\033[34m'
    RESET=$'\033[0m'
else
    GREEN=
    BLUE=
    RESET=
fi

prefix() {
    local label="$1"; shift
    local color="$1"; shift
    while IFS= read -r line; do
        printf "%s[%s]%s %s\n" "$color" "$label" "$RESET" "$line"
    done
}

# Start API and Vite. Each child's stdout/stderr is piped through prefix.
# Background tasks get reaped by the trap on EXIT.

GOWORK=off go run ./cmd/rsvp 2>&1 | prefix api "$GREEN" &
API_PID=$!

(cd web && npm run dev) 2>&1 | prefix web "$BLUE" &
WEB_PID=$!

trap 'kill 0 2>/dev/null; wait 2>/dev/null' EXIT INT TERM

wait
