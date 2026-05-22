CREATE TABLE events (
    id                  TEXT PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    starts_at           TIMESTAMP NOT NULL,
    ends_at             TIMESTAMP NOT NULL,
    timezone            TEXT NOT NULL,
    details_md          TEXT NOT NULL DEFAULT '',
    code                TEXT NOT NULL,
    locked              INTEGER NOT NULL DEFAULT 0,
    theme_accent        TEXT,
    title_font          TEXT,
    text_font           TEXT,
    -- Relative font scales for headings and body text. 1.0 is the default;
    -- range ~0.8 - 1.5. Apply as CSS variables on the public event page.
    title_scale         REAL NOT NULL DEFAULT 1.0,
    text_scale          REAL NOT NULL DEFAULT 1.0,
    title_case          TEXT NOT NULL DEFAULT 'upper' CHECK (title_case IN ('normal','upper','lower')),
    theme_header_image  TEXT,
    poster_image        TEXT,
    summary             TEXT,
    address             TEXT,
    address_label       TEXT,
    -- all_day flips the display + ICS encoding to date-only (no times).
    -- starts_at and ends_at are still stored as full timestamps; calendar
    -- output uses VALUE=DATE when this is set.
    all_day             INTEGER NOT NULL DEFAULT 0,
    -- ends_at is always required (calendar invites need it), but the host can
    -- ask us not to surface it. When end_time_hidden, the public page shows
    -- end_condition ("until people leave") in place of the end timestamp.
    end_time_hidden     INTEGER NOT NULL DEFAULT 0,
    end_condition       TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_slug_history (
    slug        TEXT PRIMARY KEY,
    event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    retired_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Guard: a retired slug can't collide with a current slug. Enforced via trigger
-- since SQLite can't express a unique constraint across two tables.
CREATE TRIGGER event_slug_history_no_collision
BEFORE INSERT ON event_slug_history
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM events WHERE slug = NEW.slug)
BEGIN
    SELECT RAISE(ABORT, 'slug already in use by an active event');
END;

CREATE TRIGGER events_slug_not_in_history
BEFORE INSERT ON events
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM event_slug_history WHERE slug = NEW.slug)
BEGIN
    SELECT RAISE(ABORT, 'slug already in use by a retired slug');
END;

CREATE TRIGGER events_slug_update_not_in_history
BEFORE UPDATE OF slug ON events
FOR EACH ROW
WHEN NEW.slug != OLD.slug
  AND EXISTS (SELECT 1 FROM event_slug_history WHERE slug = NEW.slug)
BEGIN
    SELECT RAISE(ABORT, 'slug already in use by a retired slug');
END;

CREATE TABLE attendees (
    id          TEXT PRIMARY KEY,
    event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX attendees_event_name_ci
    ON attendees(event_id, lower(name));

CREATE TABLE responses (
    id                TEXT PRIMARY KEY,
    event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status            TEXT NOT NULL CHECK (status IN ('invited','maybe','not_attending','attending')),
    status_note       TEXT,
    additional_guests INTEGER NOT NULL DEFAULT 0 CHECK (additional_guests >= 0),
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- attendee_id is CASCADE so event-delete chains cleanly. The "you can't
-- delete an attendee while they're in a response" rule is enforced at the
-- handler layer (db.AttendeeInResponse), not via FK RESTRICT, because RESTRICT
-- would block the legitimate event-wide nuke.
CREATE TABLE response_attendees (
    response_id  TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    attendee_id  TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    PRIMARY KEY (response_id, attendee_id)
);

-- The load-bearing constraint: every attendee is in at most one response.
CREATE UNIQUE INDEX response_attendees_attendee_unique
    ON response_attendees(attendee_id);

CREATE TABLE uploads (
    id          TEXT PRIMARY KEY,
    event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    path        TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX uploads_event_id ON uploads(event_id);

-- Append-only audit log for attendee + response mutations. No UI; here for
-- forensics if something looks off after the fact. Each row carries a JSON
-- payload (state before and/or after the change), the source IP from the
-- chi RealIP middleware, and the user agent so a single bad actor can be
-- isolated.
CREATE TABLE audit_log (
    id          TEXT PRIMARY KEY,
    event_id    TEXT,
    action      TEXT NOT NULL,
    target_id   TEXT,
    payload     TEXT NOT NULL DEFAULT '{}',
    source_ip   TEXT,
    user_agent  TEXT,
    at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX audit_log_event_at ON audit_log(event_id, at);
CREATE INDEX audit_log_action ON audit_log(action);
CREATE INDEX audit_log_source_ip ON audit_log(source_ip);
