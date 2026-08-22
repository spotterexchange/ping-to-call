-- Switch authentication from Microsoft/Entra OIDC to email + password.
-- Safe to rebuild `users` because no user rows exist yet (Entra sign-in was never
-- usable). Child tables reference users(id) by name and are unaffected.

DROP TABLE users;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_lower   TEXT NOT NULL UNIQUE,   -- login lookup, case-insensitive
  password_hash TEXT NOT NULL,          -- pbkdf2$iterations$saltB64$hashB64
  display_name  TEXT,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  phone_e164    TEXT,
  created_at    INTEGER NOT NULL
);
