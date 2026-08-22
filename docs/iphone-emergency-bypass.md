# iPhone: make the call ring through Do Not Disturb / sleep

The Worker + Twilio place a normal phone call. What makes it break through
**Focus / Do Not Disturb / Sleep** — and even the silent switch — is an iPhone
setting called **Emergency Bypass**, applied per-contact. No special app or
Apple entitlement is needed.

## 1. Save the Twilio number as a contact

- Contacts → **+** → give it a memorable name, e.g. **"Teams Boss Alert"**.
- Phone number = your Twilio number (`TWILIO_FROM`), in full (e.g. `+1 555 123 4567`).

## 2. Turn on Emergency Bypass

- Open the contact → **Edit**.
- Tap **Ringtone** → toggle **Emergency Bypass** *on*.
  - This lets calls from this number ring **even when Do Not Disturb / a Focus is
    on, and regardless of the ring/silent switch.**
- (Optional, if you later add SMS alerts) Tap **Text Tone** → toggle
  **Emergency Bypass** on too.
- Tap **Done**.

## 3. Belt-and-suspenders (recommended)

Focus modes can additionally filter who's allowed through. Make sure this contact
is allowed:

- Settings → **Focus** → (each mode you use, e.g. **Sleep**, **Do Not Disturb**)
  → **People** → **Allow Notifications From** → add **Teams Boss Alert**.
- With Emergency Bypass on, calls should ring regardless — but allowing the
  contact here removes any doubt.

## 4. Test it

1. Turn on **Sleep** or **Do Not Disturb**, and flip the physical silent switch on.
2. Trigger a test call:
   ```bash
   curl -X POST https://ping-to-call.<subdomain>.workers.dev/test \
     -H "X-Ping-Secret: <your WEBHOOK_SECRET>"
   ```
3. The phone should ring at full volume and speak the test message.

## Notes / limitations

- Emergency Bypass follows the **number**, so keep the Twilio number stable. If you
  ever change `TWILIO_FROM`, update the contact.
- If the phone is in **Airplane mode** with Wi‑Fi off, no cellular call can arrive.
  (A call is the most reliable channel short of that.)
- Volume: Emergency Bypass overrides the silent switch and Focus, and rings at the
  ringer volume. Keep ringer volume up for overnight use.
