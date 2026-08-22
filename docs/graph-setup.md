# Detection via Microsoft Graph (fallback)

Use this if Power Automate is blocked, or if its free triggers can't see your 1:1
**direct messages**. This path polls Microsoft Graph for new messages from your
boss and reuses the same `/ping` call path.

> **Access reality check.** This needs either (a) the ability to register an app in
> **Azure AD → App registrations**, or (b) a tenant that allows **user consent** for
> delegated Graph scopes. Many corporate tenants restrict both. If you can't do
> either, ask IT for an app registration with delegated `Chat.Read` +
> `ChannelMessage.Read.All`, or stick with [Power Automate](power-automate-setup.md).

## Why polling, not webhooks

Graph *change-notification subscriptions* push events but require a public HTTPS
endpoint that Graph validates, and short-lived subscriptions you must renew.
**Polling** with a stored refresh token is simpler, needs no inbound validation,
and is plenty fast for this use case (poll every 30–60s).

## 1. Register an app (delegated auth)

Azure Portal → **App registrations → New registration**:

- Name: `ping-to-call`
- Supported account types: single tenant is fine.
- **Authentication → Allow public client flows: Yes** (enables device-code flow).
- **API permissions → Add → Microsoft Graph → Delegated**:
  - `Chat.Read` (read your chats / DMs)
  - `ChannelMessage.Read.All` (read channel messages) — *may* need admin consent.
  - `offline_access` (to get a refresh token)
  - `User.Read`
- If a permission shows "admin consent required", have an admin grant it, or drop
  it and cover that surface with Power Automate.

Copy the **Application (client) ID** and **Directory (tenant) ID**.

## 2. Get a refresh token via device-code flow

Run once locally (no secret needed for a public client):

```bash
# Request a device code
curl -s -X POST "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/devicecode" \
  -d "client_id=<CLIENT_ID>" \
  -d "scope=offline_access Chat.Read ChannelMessage.Read.All User.Read"
```

Open the returned `verification_uri`, enter the `user_code`, and sign in. Then poll
for the token:

```bash
curl -s -X POST "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
  -d "client_id=<CLIENT_ID>" \
  -d "device_code=<DEVICE_CODE>"
```

Save the `refresh_token` from the response.

## 3. Store secrets for the poller

The poller runs as a **scheduled Cloudflare Worker (cron)** and needs:

```bash
npx wrangler secret put GRAPH_CLIENT_ID
npx wrangler secret put GRAPH_TENANT_ID
npx wrangler secret put GRAPH_REFRESH_TOKEN
```

## 4. What the poller does (implemented when you choose this path)

On each cron tick (e.g. `*/1 * * * *`):

1. Exchange the refresh token for an access token (and rotate the stored refresh
   token in KV).
2. `GET https://graph.microsoft.com/v1.0/me/chats/getAllMessages?$top=20` and/or
   channel messages, filtered by a `lastSeen` timestamp stored in KV.
3. For each new message whose sender matches the boss, build the same payload and
   run the existing call path (boss match → dedupe → rate-limit → Twilio).
4. Update `lastSeen`.

> The cron trigger and poller code are added to the Worker only if we go this route
> — the webhook path (`/ping`) is all that's needed for Power Automate. Add to
> `wrangler.toml`:
> ```toml
> [triggers]
> crons = ["*/1 * * * *"]
> ```

## Verify

- Manually invoke the scheduled handler with `npx wrangler dev` + the scheduled
  test, or wait for the cron tick, then have the boss DM you. Your phone rings.
- `npx wrangler tail` shows the poll + call decisions.
