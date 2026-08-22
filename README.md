# Ping-to-Call

**Call my cell phone — ringing through Do Not Disturb / sleep — whenever my boss
pings me on Microsoft Teams.**

Urgent messages from the boss get missed when the phone is silenced overnight or
in a Focus mode. This project turns a Teams message from the boss into a real
phone call that breaks through.

## How it works

```
Teams message ──▶ [Detector]  ──POST /ping──▶ [Cloudflare Worker] ──Twilio──▶ 📞 your cell
 (boss DM/@)      Power Automate  (+secret)     match boss, dedupe,             Emergency Bypass
                  or MS Graph                    rate-limit, then call           rings through DND
```

Three independent parts:

1. **Detector** — a Teams-side trigger that fires when the boss messages you and
   POSTs the details to the Worker. Two options depending on your account:
   [Power Automate](docs/power-automate-setup.md) (preferred, usually no admin) or
   [Microsoft Graph polling](docs/graph-setup.md) (fallback).
2. **Worker** (`worker/`) — a Cloudflare Worker that verifies a shared secret,
   confirms the sender is your boss, de-dupes and rate-limits, then places the
   call via Twilio. This half is done and tested on its own.
3. **The call** — [Twilio](docs/twilio-setup.md) rings your cell from a number you've
   marked [Emergency Bypass](docs/iphone-emergency-bypass.md) on your iPhone, so it
   rings through Focus / Do Not Disturb / the silent switch.

## Setup order

Build and prove the **call side** first — it's the reliable part and needs no
Teams access:

1. **[Twilio](docs/twilio-setup.md)** — get an Account SID, Auth Token, and a voice number.
2. **[Deploy the Worker](docs/cloudflare-deploy.md)** — set secrets, deploy, then
   hit `/test` to make your phone ring on demand.
3. **[iPhone Emergency Bypass](docs/iphone-emergency-bypass.md)** — configure the
   Twilio number so `/test` rings through Do Not Disturb.

Then wire up **detection**:

4. **[Power Automate](docs/power-automate-setup.md)** — build the flow that POSTs to
   `/ping`. If your account can't see the messages you care about (especially 1:1
   DMs), use the **[Microsoft Graph fallback](docs/graph-setup.md)** instead.

## The Worker API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness check. |
| `GET /twiml?msg=…&name=…` | none | Preview the spoken message as TwiML (no call). |
| `POST /test` | `X-Ping-Secret` | Place a test call immediately. |
| `POST /ping` | `X-Ping-Secret` | Main webhook the detector calls. |

`POST /ping` body:

```json
{
  "sender": "Jane Boss",
  "senderEmail": "jane.boss@contoso.com",
  "message": "Call me when you get this",
  "isMention": true,
  "isDirectMessage": false,
  "chatId": "19:...",
  "messageId": "1699999999999"
}
```

The Worker calls only when: the secret matches, the sender matches
`BOSS_IDENTIFIERS`, the message is a DM or @mention, it isn't a duplicate
`messageId`, and it isn't inside the `MIN_SECONDS_BETWEEN_CALLS` window.

## Configuration

Non-secret settings live in [`worker/wrangler.toml`](worker/wrangler.toml)
(`BOSS_IDENTIFIERS`, `SPEAK_CONTENT`, rate-limit/dedupe windows, voice). Secrets
(`TWILIO_*`, `MY_PHONE`, `WEBHOOK_SECRET`) are set via `wrangler secret put` — see
the [deploy guide](docs/cloudflare-deploy.md).

## Privacy note

If `SPEAK_CONTENT="true"`, the boss's message text leaves your corporate tenant
(to the Worker, then Twilio's text-to-speech). If your employer's policy forbids
that, set `SPEAK_CONTENT="false"` and the call just says *"your boss messaged you
on Teams — check it now."* Confirm this fits your workplace's rules before running
it against real messages.

## Cost

- Cloudflare Workers: free tier is ample.
- Twilio: ~$1.15/mo for the number + a few cents per call.
