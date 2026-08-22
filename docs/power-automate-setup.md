# Detection via Power Automate (preferred, usually no admin needed)

Power Automate (aka Flow) is bundled with most Microsoft 365 work accounts and
does **not** require IT admin approval to build a personal cloud flow. The flow
watches Teams for messages from your boss and POSTs them to the Worker's `/ping`.

> **First, confirm access.** Go to [make.powerautomate.com](https://make.powerautomate.com).
> If you can open it and click **Create → Automated cloud flow**, you're good.
> If it's blocked or the Teams triggers are missing, use the
> [Microsoft Graph fallback](graph-setup.md) instead.

---

## What triggers exist (and the DM caveat)

The **Microsoft Teams** connector offers, among others:

- **"When a new channel message is added"** — fires on channel posts. Standard.
- **"When keywords are mentioned"** / mention-based triggers — good for @mentions.
- **1:1 / group *chat* (DM) messages** — historically weaker. Depending on your
  tenant/licensing, a direct-chat trigger may be a **Premium** connector. If DMs
  are what you care about most and no free trigger exists, the
  [Graph fallback](graph-setup.md) reads `/me/chats` directly.

During setup you'll discover which triggers your account actually exposes. Build
whichever of the two flows below (or both) that your triggers allow.

---

## Flow A — Boss @mentions / channel messages

1. **Create → Automated cloud flow.** Name it "Teams Boss → Call".
2. **Trigger:** choose the Teams trigger available to you
   (e.g. *"When a new channel message is added"*, or a mention trigger).
3. **+ New step → Condition.** Check the message is from the boss:
   - Value 1: the sender field the trigger provides (e.g.
     `From DisplayName` or `From user id` / email).
   - Condition: **is equal to** (or **contains**) your boss's name/email.
   - You can add an **Or** row to match either display name or email.
4. In the **If yes** branch, **+ New step → HTTP** (see the HTTP action below).
5. Leave **If no** empty.
6. **Save.** Test by having the boss (or a test account) post/mention you.

## Flow B — Boss direct messages (if a chat trigger is available)

Same shape as Flow A, but with the 1:1/group chat message trigger. If that
trigger isn't offered for free, skip this flow and rely on the
[Graph fallback](graph-setup.md) for DMs.

---

## The HTTP action (the part that calls the Worker)

Add an **HTTP** action with:

- **Method:** `POST`
- **URI:** `https://ping-to-call.<subdomain>.workers.dev/ping`
- **Headers:**
  | Key             | Value                         |
  |-----------------|-------------------------------|
  | `Content-Type`  | `application/json`            |
  | `X-Ping-Secret` | *your `WEBHOOK_SECRET` value* |
- **Body:**
  ```json
  {
    "sender": "@{triggerOutputs()?['body/from/user/displayName']}",
    "senderEmail": "@{triggerOutputs()?['body/from/user/email']}",
    "message": "@{triggerOutputs()?['body/body/content']}",
    "isMention": true,
    "isDirectMessage": false,
    "chatId": "@{triggerOutputs()?['body/channelIdentity/channelId']}",
    "messageId": "@{triggerOutputs()?['body/id']}"
  }
  ```
  > The exact dynamic-content field names differ per trigger. Use Power Automate's
  > **Dynamic content** picker to insert the right fields — the JSON keys the Worker
  > expects are `sender`, `senderEmail`, `message`, `isMention`,
  > `isDirectMessage`, `chatId`, `messageId`. Set `isDirectMessage: true` in the
  > DM flow and `isMention: true` in the mention flow.

Notes:

- The Worker **also** enforces the boss match, so the flow's Condition and the
  Worker's `BOSS_IDENTIFIERS` are belt-and-suspenders. At minimum, set
  `BOSS_IDENTIFIERS` in `wrangler.toml` so the Worker never calls you for the
  wrong sender.
- `message/body/content` may contain HTML. The Worker text-to-speech will read it
  roughly as-is; if you want cleaner audio, add a **Compose**/`replace` step to
  strip tags, or set `SPEAK_CONTENT="false"` for a generic alert.
- **The HTTP action is a Premium connector.** It's included in many M365 plans;
  if yours flags it as premium, either the plan covers it or the
  [Graph fallback](graph-setup.md) (which needs no HTTP action) is the way.

---

## Verify

1. In the flow editor, **Test → Manually**, then have the boss send the qualifying
   message. The run should show a `200` from the HTTP action.
2. Your phone rings. 🎉
3. Check the Worker logs with `npx wrangler tail` to see the `/ping` decision
   (`called`, `ignored: duplicate`, etc.).
