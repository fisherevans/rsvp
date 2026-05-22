.PHONY: dev dev-api dev-web build test tidy fmt clean smoke

# rsvp is intentionally outside ~/dev/go.work. Force workspace-off so the parent
# workspace doesn't shadow this module's go.mod.
export GOWORK := off

# One-shot: API + Vite in the same terminal with prefixed logs. Ctrl+C kills both.
dev:
	@bash scripts/dev.sh

# Or run them separately in two panes.
dev-api:
	@mkdir -p data
	go run ./cmd/rsvp

dev-web:
	cd web && npm run dev

smoke:
	@bash scripts/smoke.sh

build:
	cd web && npm run build
	go build -tags embed_spa -trimpath -ldflags '-s -w' -o bin/rsvp ./cmd/rsvp

test:
	go test ./...

tidy:
	go mod tidy

fmt:
	gofmt -w .

clean:
	rm -rf bin/ web/dist/
	@echo "Data dir preserved. Remove ./data manually if you want a fresh DB."
