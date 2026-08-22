# Security notes

Ping-to-Call handles other people's calling credentials and message *metadata*, so it's
built to keep that data minimal and isolated.

## Data handling

- **No Teams message content.** The `/ingest` webhook accepts metadata only (sender, DM/
  mention flag, timestamp, opaque IDs). Message text is never sent to, stored by, or spoken
  by the app. The `call_log` stores metadata only.
- **Minimal metadata.** With in-flow sender filtering, the app only receives events for the
  senders a user explicitly listed.
- **Twilio credentials encrypted at rest** with AES-GCM (`lib/crypto.ts`), key from the
  `ENC_KEY` secret. A fresh random 12-byte IV per encryption; IV is prepended to the
  ciphertext.
- **Ingest tokens are stored hashed** (SHA-256). The plaintext token is shown once at
  generation and never persisted.
- **Account deletion** (`DELETE /api/account`) cascades to all child rows (FK
  `ON DELETE CASCADE`) and clears the session cookie.

## Authentication & sessions

- Sign-in is Microsoft / Entra OIDC (`lib/auth.ts`), requesting only
  `openid profile email User.Read` — no Teams-message permissions.
- OAuth uses a signed, short-lived **state cookie** to prevent login CSRF; the callback
  validates the state, and the id_token's **audience** and **expiry**.
- Sessions are **signed (HMAC-SHA256) HttpOnly, Secure, SameSite=Lax cookies**
  (`lib/session.ts`). Signature comparison is constant-time.

## Isolation & input handling

- Every API query is scoped to the session's `userId`; row updates use
  `WHERE id = ? AND user_id = ?`, so a user can only ever read or modify their own data.
- All D1 access uses **parameterized prepared statements**. Dynamic `UPDATE` builders use a
  fixed allow-list of column names; only values are bound.
- Inputs are validated: phone/`from` as E.164, **Twilio Account SID as `AC` + 32 hex**,
  timezone via `Intl`, schedule minutes clamped to `0..1439`, day masks to 7 bits.
- The Twilio Account SID is also URL-encoded when building the REST URL (defense in depth;
  the host is a fixed literal).
- TwiML is XML-escaped (`lib/util.ts`); the SPA renders all values through React (escaped),
  with no `dangerouslySetInnerHTML`.

## Known hardening follow-ups

- **id_token signature (JWKS) verification.** The callback currently trusts the token
  because it is fetched directly from Microsoft's token endpoint over TLS (confidential
  client) and validates audience/expiry. Adding JWKS signature verification is a reasonable
  next step for stricter defense in depth.
- **Abuse rate-limiting** on `/ingest` and sign-in beyond the per-user call rate limit
  (e.g. Cloudflare WAF / rate-limiting rules) if the app is exposed publicly at scale.
