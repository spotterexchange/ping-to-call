# Ping-to-Call

**A web app that calls your phone — ringing through Do Not Disturb / sleep — when a
specific person messages or @mentions you on Microsoft Teams.**

Urgent pings from your boss get missed when the phone is silenced overnight or in a
Focus mode. Ping-to-Call turns a Teams message from someone on *your* list into a real
phone call that breaks through. Multi-user: anyone can sign in, run the setup wizard, and
manage their own alerts.

## Privacy first

- **We never see your message content.** Detection runs inside *your own* Microsoft Power
  Automate flow, in your tenant. It forwards only **who** pinged you and whether it was a
  **DM or @mention** — never the text. The call announces the sender, not the message.
- **Only the senders you list.** The flow's condition (generated for you) forwards events
  only for the people on your list; the app never learns about anyone else.
- **Your Twilio credentials are encrypted at rest** (AES-GCM) and can be deleted anytime.

## How it works

```
Teams message ──▶ Your Power Automate flow ──POST /ingest (X-Ping-Token)──▶ Worker ──Twilio──▶ 📞 your cell
 (from a listed     (your tenant, forwards      metadata only, no content     your creds     Emergency Bypass
  sender)            sender + DM/mention only)   → mute? schedule? call        per user       rings through DND
```

## Architecture

One **Cloudflare Worker** serves everything:

- **React SPA** (`web/`) — the setup wizard and dashboard (served via the Worker's
  `[assets]` binding).
- **API** (`worker/src/lib/api.ts`) — session-authed endpoints for profile, Twilio creds,
  senders, schedules, settings, call log, test call, and flow setup.
- **Auth** (`worker/src/lib/auth.ts`) — Microsoft / Entra OIDC sign-in with signed
  HttpOnly session cookies.
- **`POST /ingest`** (`worker/src/lib/ingest.ts`) — per-user webhook (metadata only). It
  checks the sender is enabled, master mute, quiet/active schedule (in the user's
  timezone), de-dups and rate-limits, then places the Twilio call.
- **D1** stores users, senders, settings, schedules, hashed ingest tokens, and a
  metadata-only call log. **KV** holds dedupe + rate-limit state.

## Repository layout

```
worker/            Cloudflare Worker (API + ingest + static assets)
  src/index.ts     router
  src/lib/         crypto, db, call, auth, session, schedule, flow, api, ingest
  migrations/      D1 schema
  wrangler.toml
web/               Vite + React SPA (wizard + dashboard)
docs/              setup guides
```

## Setup (operator — deploy the app once)

1. **[Deploy to Cloudflare](docs/cloudflare-deploy.md)** — create D1 + KV, build the SPA,
   set secrets, and deploy the Worker.
2. **[Register the Entra app](docs/entra-app-setup.md)** — a lightweight multi-tenant
   sign-in app (no Teams-message permissions).

## Setup (each user — via the wizard)

Signing in launches a wizard that walks through:

1. Phone number + timezone.
2. **[Twilio](docs/twilio-setup.md)** credentials (bring your own) + a test call.
3. **[iPhone Emergency Bypass](docs/iphone-emergency-bypass.md)** so calls ring through DND.
4. Add senders (the people who should reach you).
5. **[Connect Teams](docs/power-automate-setup.md)** — build a Power Automate flow using the
   generated token, HTTP body, and sender-scoped condition.

## Cost

- Cloudflare Workers + D1 + KV: free tier is ample for personal/small use.
- Each user's Twilio: ~$1.15/mo for a number + a few cents per call (billed to them).

## Local development

```bash
cd worker && npm install && npx wrangler dev      # API on :8787
cd web && npm install && npm run dev              # SPA on :5173, proxies /api to :8787
```
