# Connect Teams with Power Automate (metadata-only)

Detection runs in **your own** Microsoft account via a Power Automate flow — no IT admin
consent, and **your message content never leaves your organization**. The flow forwards
only *who* pinged you and whether it was a DM or @mention. The wizard's **Connect Teams**
step generates everything below for you (your token, the exact HTTP body, and the condition
built from your sender list).

> Check access first: open [make.powerautomate.com](https://make.powerautomate.com). If you
> can **Create → Automated cloud flow**, you're set.

## 1. Get your values from the wizard

In the app's **Connect Teams** step:

- **Generate token** → copy it (shown once). This is your `X-Ping-Token`.
- Copy the **ingest URL**, the **HTTP body** template, and the **Condition** expression.

## 2. Build the flow

1. **Create → Automated cloud flow.** Name it "Teams → Ping-to-Call".
2. **Trigger:** pick the Microsoft Teams trigger you need:
   - *When I am mentioned in a channel message* (for @mentions), and/or
   - a chat/message trigger for direct messages (availability varies by plan).
   You can build one flow per trigger, all pointing at the same ingest URL.
3. **+ New step → Condition**, switch to **expression mode**, and paste the **Condition**
   from the wizard. This forwards only messages from senders on your list — everyone else
   is dropped inside your tenant.
4. In the **If yes** branch: **+ New step → HTTP**.

## 3. The HTTP action

- **Method:** `POST`
- **URI:** the ingest URL from the wizard (e.g. `https://<domain>/ingest`)
- **Headers:**
  | Key | Value |
  |-----|-------|
  | `Content-Type` | `application/json` |
  | `X-Ping-Token` | *your token* |
- **Body:** paste the wizard's **HTTP body** template. It contains only metadata:
  ```json
  {
    "sender": "@{triggerBody()?['from']?['user']?['displayName']}",
    "senderEmail": "@{triggerBody()?['from']?['user']?['email']}",
    "isMention": false,
    "isDirectMessage": true,
    "messageId": "@{triggerBody()?['id']}",
    "timestamp": "@{triggerBody()?['createdDateTime']}"
  }
  ```
  Set `isMention: true` in a mention-triggered flow; set `isDirectMessage: true` in a DM
  flow. **Never add the message body** — the app neither needs nor wants it.

> The exact dynamic-content field names differ per trigger. Use the **Dynamic content**
> picker to map the right fields to the JSON keys `sender`, `senderEmail`, `isMention`,
> `isDirectMessage`, `messageId`, `timestamp`.

## 4. Test

1. In the flow editor, **Test → Manually**, then have a listed sender message you.
2. The HTTP action should return `200`. Your phone rings.
3. The app's **Recent activity** shows the decision (called / skipped and why) — metadata
   only, never content.

## When you change your sender list

Adding or removing a person changes the condition. Re-open **Connect Teams**, copy the
updated **Condition**, and paste it back into the flow. (Turning a sender on/off, muting,
and quiet hours take effect instantly in the app and need no flow change.)

## Notes

- The **HTTP** action is a Premium connector in some plans. If yours flags it, the plan may
  already cover it; otherwise it's the one paid piece on the Teams side.
- Message `body/content` is intentionally omitted everywhere. That's the privacy guarantee.
