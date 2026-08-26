# Twilio setup

Twilio places the outbound phone call. You enter four values in the app's wizard
(Step 2): the **Account SID**, an **API Key SID**, an **API Key Secret**, and a
**voice-capable phone number** to call *from*.

> **Why an API key instead of the Auth Token?** The Auth Token grants full account
> access forever. An API key is scoped and can be rotated or revoked independently —
> Twilio recommends it, and so do we.

## 1. Create an account

Sign up at [twilio.com](https://www.twilio.com/try-twilio). A trial account
works and is free to start, but has two important limits (see below).

## 2. Get a phone number

[Console](https://console.twilio.com/) → **Phone Numbers → Manage → Buy a number**.
Pick a number with the **Voice** capability. In the US this is ~$1.15/month; calls
are a fraction of a cent each.

Copy the number in **E.164** format — a `+`, then the country code, then the number.
US numbers are `+1` then 10 digits, e.g. `+17372583742`. **Don't drop the `1`** —
`+7372583742` is a different country and will fail.

## 3. Get your credentials

- **Account SID** — [Console](https://console.twilio.com/) home page, starts with `AC…`.
- **API Key SID + Secret** — Console → **Account → API keys & tokens → API keys**
  (or go straight to
  [console.twilio.com/us1/account/keys-credentials/api-keys](https://console.twilio.com/us1/account/keys-credentials/api-keys))
  → **Create API key**:
  - **API key name:** anything, e.g. `ping-to-call`.
  - **Key type:** **Standard** (simplest — it can place calls). *Restricted* also
    works but you must grant it **Voice** permissions.
  - Click **Create**, then **copy the Secret now** — it's shown only once. The **SID**
    starts with `SK…`; the **Secret** is the long value on the "Copy secret" screen.

Enter all four values (Account SID, API Key SID, API Key Secret, phone number) in the
app's Step 2.

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

The app now shows Twilio's actual error under the **Send test call** button (e.g.
`Twilio 21212: The 'From' number … is not a valid phone number`). Common ones:

- **"is not a valid phone number" / "From" invalid** → the phone number isn't in E.164
  or is missing the country code. US = `+1` + 10 digits (`+17372583742`, not
  `+7372583742`), no spaces or dashes.
- **401 / authentication error** → wrong Account SID, API Key SID, or API Key Secret.
  The API Key SID starts with `SK…` and the Account SID with `AC…` — don't swap them.
- **"unverified" (trial)** → a trial account can only call numbers you've added under
  Console → **Phone Numbers → Verified Caller IDs**. Verify your cell, or upgrade.
- **Call connects but says nothing** → transient TwiML issue; retry.
- For the full history, watch Twilio Console → **Monitor → Logs → Calls**.
