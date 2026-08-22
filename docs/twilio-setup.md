# Twilio setup

Twilio places the outbound phone call. You need three values for the Worker
secrets: the **Account SID**, the **Auth Token**, and a **voice-capable phone
number** to call *from*.

## 1. Create an account

Sign up at [twilio.com](https://www.twilio.com/try-twilio). A trial account
works and is free to start, but has two important limits (see below).

## 2. Get a phone number

Console → **Phone Numbers → Manage → Buy a number**. Pick a number with the
**Voice** capability. In the US this is ~$1.15/month; calls are a fraction of a
cent each.

Copy the number in E.164 format (e.g. `+15551234567`) — this is `TWILIO_FROM`.

## 3. Get your credentials

Console home page shows **Account SID** (starts with `AC…`) and **Auth Token**
(click to reveal). These are `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.

## 4. Trial-account limits (important)

While your account is in trial:

1. **You can only call *verified* numbers.** Add your cell under
   Console → **Phone Numbers → Verified Caller IDs**. (Once you upgrade with a
   little credit, this restriction goes away.)
2. **Trial calls play a short "trial account" preamble** before your message.
   Upgrading removes it.

For a reliable boss-alarm, upgrade the account (add ~$20 of credit). It's cheap
to run and removes both limits.

## Cost, roughly

- Number: ~$1.15/month.
- Each call: a few cents (per-minute; these calls are ~20–30 seconds).
- Text-to-speech (`<Say>`): included.

## Troubleshooting

- **"Send test call" fails with status 401** → wrong SID/Auth Token.
- **status 400, "not a valid phone number"** → `TWILIO_FROM` / `MY_PHONE` must be
  E.164 (`+` and country code, no spaces/dashes).
- **status 400, "unverified"** → trial account calling an unverified number; verify
  it or upgrade.
- **Call connects but says nothing** → check `/twiml?msg=hi` in a browser returns
  valid XML.
- Watch Twilio Console → **Monitor → Logs → Calls** and the Worker's
  `npx wrangler tail` for the exact error.
