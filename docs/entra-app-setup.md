# Entra (Microsoft) app registration — sign-in only

Ping-to-Call uses Microsoft / Entra ID only to **sign users in**. It requests just
`openid profile email User.Read` — **no Teams-message permissions** — so it stays
lightweight and users can typically consent for themselves. (Detection runs in each user's
own Power Automate flow, not through Graph.)

## 1. Register the app

Azure Portal → **Microsoft Entra ID → App registrations → New registration**:

- **Name:** `Ping-to-Call`
- **Supported account types:**
  - For a multi-tenant app (any organization can sign in): *Accounts in any organizational
    directory*. Set `ENTRA_TENANT = "common"` in `wrangler.toml`.
  - For a single organization: *Accounts in this organizational directory only*, and set
    `ENTRA_TENANT` to your tenant id.
- **Redirect URI:** platform **Web**, value:
  `https://<your-worker-domain>/api/auth/callback`
  (must exactly match `APP_BASE_URL` + `/api/auth/callback`).

Click **Register** and copy the **Application (client) ID**.

## 2. Create a client secret

**Certificates & secrets → New client secret** → copy the **Value** (not the ID).

## 3. Confirm delegated permissions

**API permissions** should list Microsoft Graph delegated `User.Read` (added by default).
`openid`, `profile`, and `email` are standard OIDC scopes requested at sign-in. No admin
consent is required for these.

## 4. Wire it into the Worker

```bash
cd worker
npx wrangler secret put ENTRA_CLIENT_ID       # Application (client) ID
npx wrangler secret put ENTRA_CLIENT_SECRET   # the secret Value from step 2
```

Set `ENTRA_TENANT` and `APP_BASE_URL` in `wrangler.toml` `[vars]`, then `wrangler deploy`.

## Notes

- The redirect URI must match your deployed domain exactly. If you use a custom domain,
  update both `APP_BASE_URL` and the app's redirect URI.
- Hardening follow-up (tracked in the security review): the callback validates the id_token's
  audience and expiry; adding full JWKS signature verification is a reasonable next step.
