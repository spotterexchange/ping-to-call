# Deploy the Worker to Cloudflare

The Worker is the "call side": it receives a webhook and places the phone call.
It's independent of how the Teams message is detected.

## 1. Prerequisites

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
- Node.js 18+ installed locally.
- A [Twilio account](twilio-setup.md) (SID, auth token, a voice number).

## 2. Install and log in

```bash
cd worker
npm install
npx wrangler login      # opens a browser to authorize
```

## 3. Create the KV namespace

This stores de-dupe + rate-limit state.

```bash
npx wrangler kv namespace create PING_KV
```

Copy the printed `id` into `wrangler.toml` under `[[kv_namespaces]]`
(replace `REPLACE_WITH_KV_NAMESPACE_ID`).

## 4. Set the boss identifiers (and other vars)

Edit `wrangler.toml` `[vars]`:

- `BOSS_IDENTIFIERS` — e.g. `"jane.boss@contoso.com,Jane Boss"`
- `SPEAK_CONTENT` — `"true"` to read the message aloud, `"false"` for a generic alert.
- `MIN_SECONDS_BETWEEN_CALLS`, `DEDUPE_TTL_SECONDS`, `SAY_VOICE` — tune if you like.

## 5. Set the secrets

Never commit these — they go in Cloudflare's secret store:

```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM        # +15551234567
npx wrangler secret put MY_PHONE           # +15559876543
npx wrangler secret put WEBHOOK_SECRET     # any long random string
```

Generate a good webhook secret with:

```bash
openssl rand -hex 32
```

Save that value — the detector (Power Automate / Graph) must send it in the
`X-Ping-Secret` header.

## 6. Deploy

```bash
npx wrangler deploy
```

Wrangler prints your Worker URL, e.g. `https://ping-to-call.<subdomain>.workers.dev`.

## 7. Smoke test

```bash
# liveness
curl https://ping-to-call.<subdomain>.workers.dev/health

# place a REAL test call to your phone
curl -X POST https://ping-to-call.<subdomain>.workers.dev/test \
  -H "X-Ping-Secret: <your WEBHOOK_SECRET>"
```

Your phone should ring within a few seconds. If it doesn't, run
`npx wrangler tail` in another terminal to watch live logs, and check the
[Twilio setup](twilio-setup.md) troubleshooting notes.

## Watching logs

```bash
npx wrangler tail
```
