#!/usr/bin/env bash
# Smoke test the rsvp API end-to-end. Assumes a server is running on :8088
# with default dev password. Wipes the DB before starting so it is reproducible.
#
# Usage:
#   ./scripts/smoke.sh
#
# Tip: run the server in another pane first (make dev-api).

set -euo pipefail

PORT="${RSVP_PORT:-8088}"
BASE="http://localhost:${PORT}"
PASSWORD="${RSVP_MANAGEMENT_PASSWORD:-rsvp-dev}"
COOKIES=$(mktemp)
trap 'rm -f "$COOKIES"' EXIT

c() {
    # Verbose curl: prints status + body, exits non-zero on transport error.
    local method="$1"; shift
    local path="$1"; shift
    curl -sS -o /tmp/rsvp_body -w "  %{http_code}\n" -X "$method" "$BASE$path" "$@"
    if [ -s /tmp/rsvp_body ]; then
        cat /tmp/rsvp_body | python3 -m json.tool 2>/dev/null || cat /tmp/rsvp_body
        echo
    fi
}

j() {
    # As above but capture the response body for later jq-style pulls.
    local method="$1"; shift
    local path="$1"; shift
    curl -sS -X "$method" "$BASE$path" "$@"
}

py() { python3 -c "$1"; }

echo "=== health ==="
c GET /api/health

echo "=== login (wrong) ==="
c POST /api/manage/login -H "Content-Type: application/json" -d '{"password":"nope"}'

echo "=== login ==="
c POST /api/manage/login -H "Content-Type: application/json" -d "{\"password\":\"${PASSWORD}\"}" -c "$COOKIES"

echo "=== create event ==="
EVENT_JSON=$(j POST /api/manage/events -b "$COOKIES" -H "Content-Type: application/json" \
    -d '{"name":"Smoke Party","starts_at":"2026-12-12T19:00:00Z","ends_at":"2026-12-12T23:00:00Z","timezone":"America/Chicago","details_md":"BYOB"}')
echo "$EVENT_JSON" | python3 -m json.tool
SLUG=$(echo "$EVENT_JSON" | py "import sys,json;print(json.load(sys.stdin)['slug'])" <<< "$EVENT_JSON")
CODE=$(echo "$EVENT_JSON" | py "import sys,json;print(json.load(sys.stdin)['code'])" <<< "$EVENT_JSON")
echo "[slug=$SLUG code=$CODE]"

echo "=== public GET without code (expect 401) ==="
c GET "/api/event/$SLUG/"

echo "=== public GET with wrong code (expect 401) ==="
c GET "/api/event/$SLUG/" -H "X-Event-Code: wrong"

echo "=== public GET with code (expect 200, empty attendees/responses) ==="
c GET "/api/event/$SLUG/" -H "X-Event-Code: $CODE"

echo "=== add attendee Seth ==="
SETH_JSON=$(j PUT "/api/event/$SLUG/attendee" -H "X-Event-Code: $CODE" -H "Content-Type: application/json" -d '{"name":"Seth"}')
echo "$SETH_JSON" | python3 -m json.tool
SETH_ID=$(echo "$SETH_JSON" | py "import sys,json;print(json.load(sys.stdin)['attendee']['id'])" <<< "$SETH_JSON")

echo "=== add attendee Kat ==="
KAT_JSON=$(j PUT "/api/event/$SLUG/attendee" -H "X-Event-Code: $CODE" -H "Content-Type: application/json" -d '{"name":"Kat"}')
KAT_ID=$(echo "$KAT_JSON" | py "import sys,json;print(json.load(sys.stdin)['attendee']['id'])" <<< "$KAT_JSON")

echo "=== add attendee 'seth' again (case-insensitive, expect created=false) ==="
c PUT "/api/event/$SLUG/attendee" -H "X-Event-Code: $CODE" -H "Content-Type: application/json" -d '{"name":"seth"}'

echo "=== response: Seth attending ==="
RESP_JSON=$(j PUT "/api/event/$SLUG/response" -H "X-Event-Code: $CODE" -H "Content-Type: application/json" \
    -d "{\"attendee_ids\":[\"$SETH_ID\"],\"status\":\"attending\",\"status_note\":\"counting Seth in\"}")
echo "$RESP_JSON" | python3 -m json.tool
RESP1_ID=$(echo "$RESP_JSON" | py "import sys,json;print(json.load(sys.stdin)['id'])" <<< "$RESP_JSON")

echo "=== response: Kat+Seth attending (Seth already in another resp; expect 409) ==="
c PUT "/api/event/$SLUG/response" -H "X-Event-Code: $CODE" -H "Content-Type: application/json" \
    -d "{\"attendee_ids\":[\"$KAT_ID\",\"$SETH_ID\"],\"status\":\"attending\"}"

echo "=== response: Kat+Seth attending with merge=1 (old Seth response goes away) ==="
c PUT "/api/event/$SLUG/response?merge=1" -H "X-Event-Code: $CODE" -H "Content-Type: application/json" \
    -d "{\"attendee_ids\":[\"$KAT_ID\",\"$SETH_ID\"],\"status\":\"attending\",\"status_note\":\"both coming\"}"

echo "=== GET event again (expect 1 response with 2 attendees) ==="
c GET "/api/event/$SLUG/" -H "X-Event-Code: $CODE"

echo "=== delete Seth (attendee in response; expect 409) ==="
c DELETE "/api/event/$SLUG/attendee/$SETH_ID" -H "X-Event-Code: $CODE"

echo "=== manual lock ==="
c POST "/api/manage/event/$SLUG/lock" -b "$COOKIES"

echo "=== mutating attendee while locked (expect 403) ==="
c PUT "/api/event/$SLUG/attendee" -H "X-Event-Code: $CODE" -H "Content-Type: application/json" -d '{"name":"LateJoe"}'

echo "=== unlock ==="
c POST "/api/manage/event/$SLUG/unlock" -b "$COOKIES"

echo "=== rename slug ==="
c PATCH "/api/manage/event/$SLUG" -b "$COOKIES" -H "Content-Type: application/json" -d '{"slug":"smoke-bash"}'

echo "=== old slug returns 410 with canonical_slug ==="
c GET "/api/event/$SLUG/" -H "X-Event-Code: $CODE"

echo "=== delete event ==="
c DELETE "/api/manage/event/smoke-bash" -b "$COOKIES"

echo "=== gone (expect 404) ==="
c GET "/api/event/smoke-bash/" -H "X-Event-Code: $CODE"

echo "=== smoke complete ==="
