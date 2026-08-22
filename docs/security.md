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

- Sign-in is **email + password** (`lib/auth.ts`) — no Microsoft/Azure dependency.
  Passwords are hashed with **PBKDF2-SHA256 (100k iterations, per-user random salt)** via
  WebCrypto (`lib/crypto.ts`); only the `pbkdf2$…` string is stored, never the password.
- Password verification is **constant-time**, and login runs a dummy verify for unknown
  emails to avoid a timing/user-enumeration signal; errors are generic ("invalid email or
  password").
- **Failed-login throttle:** attempts are counted per client IP in KV and blocked after 10
  within a 10-minute window.
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

- **Email verification / password reset.** Sign-up currently trusts the email as entered;
  adding a verification email and a reset flow is the natural next step for public use.
- **Abuse rate-limiting** on `/ingest` beyond the per-user call rate limit, and stronger
  login protection (e.g. Cloudflare WAF / Turnstile) if the app is exposed publicly at scale.
