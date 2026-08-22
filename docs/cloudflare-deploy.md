# Deploy Ping-to-Call to Cloudflare

One Worker serves the API, the `/ingest` webhook, and the static SPA. Data lives in D1;
dedupe/rate-limit state in KV.

## 1. Prerequisites

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
- Node.js 18+.

> Prefer the copy-paste, Codespaces-friendly walkthrough? See
> [../app-setup.md](../app-setup.md). This page is the concise reference.

## 2. Install and log in

```bash
cd worker
npm install
npx wrangler login
```

## 3. Create D1 and KV

```bash
npx wrangler d1 create ping-to-call
npx wrangler kv namespace create PING_KV
```

Paste the returned `database_id` and KV `id` into `wrangler.toml`
(`REPLACE_WITH_D1_DATABASE_ID` and `REPLACE_WITH_KV_NAMESPACE_ID`).

## 4. Apply the database schema

```bash
npx wrangler d1 migrations apply ping-to-call --remote
```

## 5. Set vars and secrets

In `wrangler.toml` `[vars]`:

- `APP_BASE_URL` — your Worker URL (set after the first deploy, then redeploy), e.g.
  `https://ping-to-call.<subdomain>.workers.dev`

Secrets:

```bash
npx wrangler secret put ENC_KEY              # openssl rand -base64 32   (must be 32 bytes)
npx wrangler secret put SESSION_SECRET       # openssl rand -hex 32
```

> `ENC_KEY` encrypts stored Twilio credentials. If you rotate it, previously stored
> credentials can no longer be decrypted and users must re-enter them.

## 6. Build the SPA

```bash
cd ../web
npm install
npm run build          # outputs web/dist, which the Worker serves
```

## 7. Deploy

```bash
cd ../worker
npx wrangler deploy
```

Wrangler prints the Worker URL. Put it in `APP_BASE_URL`, then `wrangler deploy` once more so
the ingest URL shown in the wizard is correct.

## 8. Smoke test

```bash
curl https://<your-domain>/health
```

Then open the site, create an account (email + password), and run the wizard. The wizard's
**Send test call** validates Twilio + Emergency Bypass end to end.

## Redeploying

- Backend change → `cd worker && npx wrangler deploy`.
- Frontend change → `cd web && npm run build`, then `cd ../worker && npx wrangler deploy`.
- Schema change → add a file under `worker/migrations/`, then
  `npx wrangler d1 migrations apply ping-to-call --remote`.

## Logs

```bash
npx wrangler tail
```
