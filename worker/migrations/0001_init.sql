-- Ping-to-Call schema. Multi-user, metadata-only (no Teams message content stored).

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  entra_oid     TEXT UNIQUE NOT NULL,
  email         TEXT,
  display_name  TEXT,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  phone_e164    TEXT,
  created_at    INTEGER NOT NULL
);

-- Each user's own Twilio credentials, encrypted at rest (AES-GCM).
CREATE TABLE twilio_config (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_sid_enc TEXT NOT NULL,
  auth_token_enc  TEXT NOT NULL,
  from_number     TEXT NOT NULL,
  verified_at     INTEGER
);

-- The people whose Teams pings should trigger a call.
CREATE TABLE senders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT,
  email         TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_senders_user ON senders(user_id);

CREATE TABLE settings (
  user_id                    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  master_mute                INTEGER NOT NULL DEFAULT 0,
  min_seconds_between_calls  INTEGER NOT NULL DEFAULT 120,
  updated_at                 INTEGER NOT NULL
);

-- Quiet/active windows, evaluated in the user's timezone.
--   kind='active': if any exist, calls are allowed ONLY inside an active window.
--   kind='quiet' : calls are suppressed inside any quiet window.
-- days_mask is a bitmask: bit 0 = Sunday ... bit 6 = Saturday.
-- start_min/end_min are minutes from local midnight; start > end means it wraps past midnight.
CREATE TABLE schedules (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('active','quiet')),
  days_mask   INTEGER NOT NULL DEFAULT 127,
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_schedules_user ON schedules(user_id);

-- Per-user webhook secret for /ingest. Only the SHA-256 hash is stored.
CREATE TABLE ingest_tokens (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_ingest_token_hash ON ingest_tokens(token_hash);

-- History for the dashboard. Metadata only — never message content.
CREATE TABLE call_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender      TEXT,
  is_mention  INTEGER NOT NULL DEFAULT 0,
  decision    TEXT NOT NULL,
  call_sid    TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_calllog_user ON call_log(user_id, created_at);
