import type { Env, IngestPayload } from "../types";
import { sha256Hex, decrypt } from "./crypto";
import { buildTwiml, placeCall } from "./call";
import { scheduleAllows } from "./schedule";
import { json, nowSec } from "./util";
import {
  addCallLog,
  getSettings,
  getTwilioConfig,
  getUserById,
  getUserIdByTokenHash,
  listSchedules,
  listSenders,
  matchEnabledSender,
} from "./db";

const DEDUPE_TTL = 3600;

/**
 * POST /ingest — called by the user's Power Automate flow. Metadata only; the
 * message body is never sent to us. Auth is a per-user token in X-Ping-Token.
 */
export async function handleIngest(req: Request, env: Env): Promise<Response> {
  const token = req.headers.get("X-Ping-Token") || "";
  if (!token) return json({ ok: false, error: "missing token" }, 401);
  const userId = await getUserIdByTokenHash(env.DB, await sha256Hex(token));
  if (!userId) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: IngestPayload;
  try {
    payload = (await req.json()) as IngestPayload;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const { sender, senderEmail, isMention, isDirectMessage, messageId } = payload;
  const mention = isMention === true;

  // Sender must be on the user's list and enabled (safety net over in-flow filter).
  const senders = await listSenders(env.DB, userId);
  const matched = matchEnabledSender(senders, sender, senderEmail);
  if (!matched) {
    await addCallLog(env.DB, userId, sender || senderEmail || null, mention, "ignored:sender", null);
    return json({ ok: true, action: "ignored", reason: "sender not enabled" });
  }

  // Trigger rule: DM or @mention. If the flow supplied neither flag, trust it.
  const flagsProvided = isMention !== undefined || isDirectMessage !== undefined;
  const qualifies = !flagsProvided || mention || isDirectMessage === true;
  if (!qualifies) {
    await addCallLog(env.DB, userId, matched.display_name || matched.email, mention, "ignored:rule", null);
    return json({ ok: true, action: "ignored", reason: "not a DM or mention" });
  }

  // De-dupe on messageId.
  if (messageId) {
    const key = `dedupe:${userId}:${messageId}`;
    if (await env.PING_KV.get(key)) {
      return json({ ok: true, action: "ignored", reason: "duplicate" });
    }
    await env.PING_KV.put(key, "1", { expirationTtl: DEDUPE_TTL });
  }

  const settings = await getSettings(env.DB, userId);
  if (settings.master_mute) {
    await addCallLog(env.DB, userId, matched.display_name || matched.email, mention, "ignored:muted", null);
    return json({ ok: true, action: "ignored", reason: "muted" });
  }

  // Schedule (evaluated in the user's timezone).
  const user = await getUserById(env.DB, userId);
  if (!user) return json({ ok: false, error: "user missing" }, 500);
  const sched = scheduleAllows(await listSchedules(env.DB, userId), user.timezone);
  if (!sched.allowed) {
    await addCallLog(env.DB, userId, matched.display_name || matched.email, mention, `ignored:${sched.reason}`, null);
    return json({ ok: true, action: "ignored", reason: sched.reason });
  }

  // Rate-limit.
  const minGap = Math.max(0, settings.min_seconds_between_calls);
  const now = nowSec();
  const last = parseInt((await env.PING_KV.get(`lastcall:${userId}`)) || "0", 10);
  if (minGap > 0 && now - last < minGap) {
    await addCallLog(env.DB, userId, matched.display_name || matched.email, mention, "ignored:ratelimit", null);
    return json({ ok: true, action: "ignored", reason: "rate-limited" });
  }

  // Config present?
  const tw = await getTwilioConfig(env.DB, userId);
  if (!tw || !user.phone_e164) {
    await addCallLog(env.DB, userId, matched.display_name || matched.email, mention, "ignored:noconfig", null);
    return json({ ok: true, action: "ignored", reason: "setup incomplete" });
  }

  // Place the call.
  const creds = {
    accountSid: await decrypt(env.ENC_KEY, tw.account_sid_enc),
    authToken: await decrypt(env.ENC_KEY, tw.auth_token_enc),
    from: tw.from_number,
  };
  const twiml = buildTwiml({ senderName: matched.display_name || matched.email || "someone", isMention: mention });
  const result = await placeCall(creds, user.phone_e164, twiml);
  if (!result.ok) {
    await addCallLog(env.DB, userId, matched.display_name || matched.email, mention, "call_failed", null);
    return json({ ok: false, action: "call_failed", status: result.status, detail: result.detail }, 502);
  }

  await env.PING_KV.put(`lastcall:${userId}`, String(now));
  await addCallLog(env.DB, userId, matched.display_name || matched.email, mention, "called", result.callSid);
  return json({ ok: true, action: "called", callSid: result.callSid });
}
