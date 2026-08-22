# Ping-to-Call — Setup Guide

A single, ordered walkthrough to get the app running. It assumes you're working in a
**GitHub Codespace**, but any machine with Node 18+ works — the app itself runs on
**Cloudflare's edge**, not in the Codespace. The Codespace is just where you run the
`wrangler` CLI and edit `worker/wrangler.toml`.

You sign in to the app with your own **email + password** — no Microsoft/Azure account is
needed to run or use it. (Teams *detection* still happens later via Power Automate in
whatever account receives your boss's messages, but that's independent of signing in here.)

---

## Accounts you'll need (free tiers are fine)

| Account | What it's for | When |
|---|---|---|
| **Cloudflare** | Hosts the app, database (D1), KV, and the webhook | Now |
| **Twilio** | Places the phone calls (each user brings their own) | In the wizard, Step 9 |

---

## Step 1 — Open the repo in a Codespace

- On the GitHub repo page → **Code ▸ Codespaces ▸ Create codespace** on branch
  `claude/teams-boss-alert-call-88wdku`.
- Wait for the terminal. Node and `openssl` are preinstalled.

## Step 2 — Authenticate wrangler (API-token method)

Interactive `wrangler login` needs a browser callback that Codespaces often can't complete,
so use an API token instead:

1. Go to **dash.cloudflare.com ▸ My Profile ▸ API Tokens ▸ Create Token**.
2. Use the **"Edit Cloudflare Workers"** template, then adjust the fields as below and
   **Continue to summary → Create Token → copy it.**

   **Permissions**
   - **Before creating, add the D1 permission** — this template omits it, and without it
     `wrangler d1 create` fails later with `Authentication error [code: 10000]`. Click
     **+ Add more** and add a row: **Account** · **D1** · **Edit**.
   - While you're there, confirm the template already includes **Account · Workers Scripts ·
     Edit** and **Account · Workers KV Storage · Edit** (it does by default).

   **Account Resources**
   - Operator: **Include**
   - Select dropdown: pick **your account** (it's listed by name). This one is required.

   **Zone Resources**
   - The Workers template insists on a zone resource, but you don't actually have/need a
     custom domain. Change the middle dropdown from **"Specific zone"** to **"All zones"**
     (or set the first dropdown to **Include** and choose **"All zones from an account" →
     your account**).
   - If you have no domains on Cloudflare, "All zones" simply means zero zones — that's fine
     and satisfies the requirement. You're deploying to `*.workers.dev`, which doesn't use
     zones.

   **Client IP Address Filtering**
   - **Leave it completely empty. Don't add a row.** Codespaces IPs change, so pinning an IP
     would just lock you out. The default (applies to all addresses) is what you want.

   **TTL**
   - Leave both **Start/End Date empty** for a non-expiring token (simplest).
   - Optional: for auto-expiry, set an **End Date** a few weeks out — but then you'll need to
     make a new token after that.

   > Already created the token without D1? Just edit it — dash ▸ API Tokens ▸ your token ▸
   > **Edit** ▸ add **Account · D1 · Edit** ▸ **Update Token**. The token string stays the
   > same, so no need to re-copy or re-`export`.
3. In the Codespace terminal:

```bash
export CLOUDFLARE_API_TOKEN=paste-token-here
cd worker
npm install
npx wrangler whoami        # should show your account
```

> Note: a Codespace restart clears environment variables, so you'll need to
> `export CLOUDFLARE_API_TOKEN=…` again before running wrangler. Your deployed app keeps
> running regardless.

## Step 3 — Create the database and KV, then paste the IDs

```bash
npx wrangler d1 create ping-to-call
npx wrangler kv namespace create PING_KV
```

Copy the two IDs from the output into **`worker/wrangler.toml`**:

- `database_id = "…"` (replaces `REPLACE_WITH_D1_DATABASE_ID`)
- KV `id = "…"` (replaces `REPLACE_WITH_KV_NAMESPACE_ID`)

## Step 4 — Create the database tables

```bash
npx wrangler d1 migrations apply ping-to-call --remote
```

> If you set this up earlier and only applied the first migration, run this command again —
> it applies any new migrations (the email/password auth schema is migration `0002`).

## Step 5 — Generate and set the two crypto secrets

These are two random values the app needs. `ENC_KEY` and `SESSION_SECRET` are the **names**
Cloudflare stores them under — you type those names literally and do **not** replace them
with anything. The random value goes in *afterward*, not on the command line.

**Easiest — pipe the random value straight in (no copy/paste):**

```bash
openssl rand -base64 32 | tr -d '\n' | npx wrangler secret put ENC_KEY
openssl rand -hex 32    | tr -d '\n' | npx wrangler secret put SESSION_SECRET
```

**Or do it manually, if you prefer to see the value:**

1. Run `openssl rand -base64 32`. It prints a random string (e.g. `7Kd2mP9x…rL8=`) —
   select it in the terminal and copy it.
2. Run `npx wrangler secret put ENC_KEY` (typed exactly — `ENC_KEY` is the name). It prompts
   `Enter a secret value:` — **paste the copied string there** and press Enter. (Paste in a
   Codespaces terminal is usually Ctrl+Shift+V or right-click. The value is hidden as you
   paste; that's normal.)
3. Repeat with `openssl rand -hex 32` and `npx wrangler secret put SESSION_SECRET`.

You don't need to save these two values anywhere — they live in Cloudflare and are only read
server-side. (Your Twilio credentials come later, in the app's wizard UI — not here.)

> `ENC_KEY` encrypts stored Twilio credentials. If you ever rotate it, existing stored
> credentials can't be decrypted and users must re-enter them.

## Step 5.5 — Sync the latest code + apply the auth migration

If you completed Steps 1–5 earlier, pull the latest and make sure the email/password auth
migration (`0002`) is applied before deploying — otherwise sign-up will fail against the old
database schema.

```bash
git pull
# still in worker/, with CLOUDFLARE_API_TOKEN exported:
npx wrangler d1 migrations apply ping-to-call --remote
```

- `git pull` brings in the current code (email/password sign-in — no Microsoft account
  needed) and this updated guide.
- The migrate command applies any not-yet-applied migrations. If it says everything is
  already applied, you're good.

## Step 6 — Build the web UI

```bash
cd ../web
npm install
npm run build
cd ../worker
```

## Step 7 — First deploy (to learn your URL)

```bash
npx wrangler deploy
```

It prints a URL like `https://ping-to-call.<your-subdomain>.workers.dev`. **Copy it.**

## Step 8 — Set your app URL and redeploy

1. In `worker/wrangler.toml` `[vars]`, set:
   ```toml
   APP_BASE_URL = "https://ping-to-call.<your-subdomain>.workers.dev"
   ```
   (This is used to build the `/ingest` URL the wizard shows you later.)
2. Redeploy:
   ```bash
   npx wrangler deploy
   ```

Quick check: open `https://<your-domain>/health` — it should return `{"ok":true,...}`.

## Step 9 — Create your account and run the in-app wizard

Open your Worker URL in a browser and **Create an account** (email + password). The wizard
covers the rest:

1. **Phone + timezone** — your cell in E.164 (e.g. `+15551234567`).
2. **Twilio** — create a Twilio account, buy a **Voice**-capable number, and paste the
   **Account SID**, **Auth Token**, and **number** into the form. Click **Save**, then
   **Send test call**.
   - On a Twilio **trial**, first verify your cell under **Verified Caller IDs**, and expect
     a short "trial account" preamble. Upgrading (~$20 credit) removes both.
3. **iPhone Emergency Bypass** — save the Twilio number as a contact →
   Edit ▸ Ringtone ▸ **Emergency Bypass ON**. Turn on Do Not Disturb and hit
   **Send test call** again to confirm it rings through.
4. **Senders** — add your boss (email is the most reliable match).
5. **Connect Teams** — click **Generate token** (copy it, shown once), then build a Power
   Automate flow using the **token**, **HTTP body**, and **condition** the wizard shows.
   That flow is what forwards pings to the app — **metadata only, never message content.**
   See [docs/power-automate-setup.md](docs/power-automate-setup.md) for the flow details.

## Step 10 — End-to-end test

Have your boss (or a second account you added as a sender) send you a Teams DM or @mention →
your phone rings. The dashboard's **Recent activity** shows each decision (called, or
skipped and why).

---

## Redeploying later

- **Backend change:** `cd worker && npx wrangler deploy`
- **Frontend change:** `cd web && npm run build`, then `cd ../worker && npx wrangler deploy`
- **Schema change:** add a file under `worker/migrations/`, then
  `npx wrangler d1 migrations apply ping-to-call --remote`

## Gotchas

- **Codespace restart** clears `CLOUDFLARE_API_TOKEN` — re-`export` it before using wrangler.
- **Power Automate 1:1 DM trigger** may be a Premium connector depending on your Microsoft
  365 plan; @mention triggers are broadly available. You'll see which when building the flow.
- **`ENC_KEY` must be exactly 32 bytes** — `openssl rand -base64 32` produces exactly that.

## Related docs

- [docs/cloudflare-deploy.md](docs/cloudflare-deploy.md) — deploy reference
- [docs/twilio-setup.md](docs/twilio-setup.md) — Twilio specifics + troubleshooting
- [docs/iphone-emergency-bypass.md](docs/iphone-emergency-bypass.md) — DND bypass
- [docs/power-automate-setup.md](docs/power-automate-setup.md) — the Teams flow
- [docs/security.md](docs/security.md) — data handling & security posture
