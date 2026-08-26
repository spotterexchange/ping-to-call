import type { Env } from "../types";
import { decrypt, encrypt, randomToken, sha256Hex } from "./crypto";
import { buildTwiml, placeCall } from "./call";
import { buildFlowCondition, ingestBodyTemplate } from "./flow";
import { json } from "./util";
import {
  addSchedule,
  addSender,
  deleteSchedule,
  deleteSender,
  deleteUser,
  getSettings,
  getTwilioConfig,
  getUserById,
  hasIngestToken,
  listCallLog,
  listSchedules,
  listSenders,
  markTwilioVerified,
  setIngestToken,
  updateSender,
  updateSettings,
  updateUserProfile,
  upsertTwilioConfig,
} from "./db";
import { clearSessionCookie } from "./session";

const E164 = /^\+[1-9]\d{6,14}$/;
const TWILIO_SID = /^AC[0-9a-fA-F]{32}$/;
const TWILIO_KEY_SID = /^SK[0-9a-fA-F]{32}$/;

/** Pull a human-readable message out of a Twilio REST error body. */
function twilioErrorMessage(detail: string | undefined): string {
  if (!detail) return "call failed";
  try {
    const j = JSON.parse(detail) as { message?: string; code?: number };
    if (j.message) return `Twilio ${j.code ?? ""}: ${j.message}`.trim();
  } catch {
    /* not JSON */
  }
  return "call failed";
}

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function ingestUrl(env: Env): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/ingest`;
}

/**
 * Session-authenticated API. `userId` is the verified current user; every query
 * is scoped to it, so users can only ever touch their own data.
 */
export async function handleApi(
  req: Request,
  env: Env,
  userId: string,
  url: URL,
): Promise<Response> {
  const path = url.pathname;
  const m = req.method;

  // ---- Current user + setup status ----
  if (path === "/api/me" && m === "GET") {
    const user = await getUserById(env.DB, userId);
    if (!user) return json({ ok: false, error: "not found" }, 404);
    const tw = await getTwilioConfig(env.DB, userId);
    const senders = await listSenders(env.DB, userId);
    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        timezone: user.timezone,
        phone: user.phone_e164,
      },
      setup: {
        hasPhone: Boolean(user.phone_e164),
        hasTwilio: Boolean(tw),
        twilioVerified: Boolean(tw?.verified_at),
        hasIngestToken: await hasIngestToken(env.DB, userId),
        senderCount: senders.length,
      },
    });
  }

  // ---- Profile (phone + timezone) ----
  if (path === "/api/profile" && m === "POST") {
    const body = await readJson<{ phone?: string; timezone?: string }>(req);
    if (!body) return json({ ok: false, error: "invalid json" }, 400);
    const fields: { phone_e164?: string; timezone?: string } = {};
    if (body.phone !== undefined) {
      if (!E164.test(body.phone)) return json({ ok: false, error: "phone must be E.164, e.g. +15551234567" }, 400);
      fields.phone_e164 = body.phone;
    }
    if (body.timezone !== undefined) {
      if (!validTimezone(body.timezone)) return json({ ok: false, error: "invalid timezone" }, 400);
      fields.timezone = body.timezone;
    }
    await updateUserProfile(env.DB, userId, fields);
    return json({ ok: true });
  }

  // ---- Twilio credentials (API key) ----
  if (path === "/api/twilio" && m === "PUT") {
    const body = await readJson<{
      accountSid?: string;
      apiKeySid?: string;
      apiKeySecret?: string;
      from?: string;
    }>(req);
    if (!body?.accountSid || !body?.apiKeySid || !body?.apiKeySecret || !body?.from) {
      return json({ ok: false, error: "accountSid, apiKeySid, apiKeySecret, and from are required" }, 400);
    }
    if (!TWILIO_SID.test(body.accountSid.trim())) {
      return json({ ok: false, error: "Account SID must look like AC + 32 hex chars" }, 400);
    }
    if (!TWILIO_KEY_SID.test(body.apiKeySid.trim())) {
      return json({ ok: false, error: "API Key SID must look like SK + 32 hex chars" }, 400);
    }
    if (!E164.test(body.from.trim())) {
      return json({ ok: false, error: "Phone number must be E.164, e.g. +17372583742 (include the country code)" }, 400);
    }
    const sidEnc = await encrypt(env.ENC_KEY, body.accountSid.trim());
    const keyEnc = await encrypt(env.ENC_KEY, body.apiKeySid.trim());
    const secretEnc = await encrypt(env.ENC_KEY, body.apiKeySecret.trim());
    await upsertTwilioConfig(env.DB, userId, sidEnc, keyEnc, secretEnc, body.from.trim());
    return json({ ok: true });
  }

  // ---- Test call ----
  if (path === "/api/test-call" && m === "POST") {
    const user = await getUserById(env.DB, userId);
    const tw = await getTwilioConfig(env.DB, userId);
    if (!user?.phone_e164) return json({ ok: false, error: "set your phone first" }, 400);
    if (!tw) return json({ ok: false, error: "add Twilio credentials first" }, 400);
    const creds = {
      accountSid: await decrypt(env.ENC_KEY, tw.account_sid_enc),
      apiKeySid: tw.api_key_sid_enc ? await decrypt(env.ENC_KEY, tw.api_key_sid_enc) : null,
      authToken: await decrypt(env.ENC_KEY, tw.auth_token_enc),
      from: tw.from_number,
    };
    const twiml = buildTwiml({ senderName: "your boss (test)", isMention: true });
    const result = await placeCall(creds, user.phone_e164, twiml);
    if (!result.ok) {
      return json({ ok: false, error: twilioErrorMessage(result.detail), status: result.status }, 502);
    }
    await markTwilioVerified(env.DB, userId);
    return json({ ok: true, callSid: result.callSid });
  }

  // ---- Senders ----
  if (path === "/api/senders" && m === "GET") {
    return json({ ok: true, senders: await listSenders(env.DB, userId) });
  }
  if (path === "/api/senders" && m === "POST") {
    const body = await readJson<{ displayName?: string; email?: string }>(req);
    if (!body || (!body.displayName && !body.email)) {
      return json({ ok: false, error: "displayName or email required" }, 400);
    }
    const s = await addSender(env.DB, userId, body.displayName ?? null, body.email ?? null);
    return json({ ok: true, sender: s });
  }
  const senderMatch = path.match(/^\/api\/senders\/([^/]+)$/);
  if (senderMatch) {
    const id = senderMatch[1];
    if (m === "PATCH") {
      const body = await readJson<{ enabled?: boolean; displayName?: string; email?: string }>(req);
      if (!body) return json({ ok: false, error: "invalid json" }, 400);
      await updateSender(env.DB, userId, id, {
        enabled: body.enabled,
        display_name: body.displayName,
        email: body.email,
      });
      return json({ ok: true });
    }
    if (m === "DELETE") {
      await deleteSender(env.DB, userId, id);
      return json({ ok: true });
    }
  }

  // ---- Settings ----
  if (path === "/api/settings" && m === "GET") {
    return json({ ok: true, settings: await getSettings(env.DB, userId) });
  }
  if (path === "/api/settings" && m === "PATCH") {
    const body = await readJson<{ masterMute?: boolean; minSecondsBetweenCalls?: number }>(req);
    if (!body) return json({ ok: false, error: "invalid json" }, 400);
    await updateSettings(env.DB, userId, {
      master_mute: body.masterMute,
      min_seconds_between_calls: body.minSecondsBetweenCalls,
    });
    return json({ ok: true });
  }

  // ---- Schedules ----
  if (path === "/api/schedules" && m === "GET") {
    return json({ ok: true, schedules: await listSchedules(env.DB, userId) });
  }
  if (path === "/api/schedules" && m === "POST") {
    const body = await readJson<{ kind?: string; daysMask?: number; startMin?: number; endMin?: number }>(req);
    if (!body || (body.kind !== "active" && body.kind !== "quiet")) {
      return json({ ok: false, error: "kind must be 'active' or 'quiet'" }, 400);
    }
    const days = Number.isInteger(body.daysMask) ? (body.daysMask as number) & 127 : 127;
    const start = clampMin(body.startMin);
    const end = clampMin(body.endMin);
    if (start === null || end === null) return json({ ok: false, error: "startMin/endMin must be 0..1439" }, 400);
    const s = await addSchedule(env.DB, userId, body.kind, days, start, end);
    return json({ ok: true, schedule: s });
  }
  const schedMatch = path.match(/^\/api\/schedules\/([^/]+)$/);
  if (schedMatch && m === "DELETE") {
    await deleteSchedule(env.DB, userId, schedMatch[1]);
    return json({ ok: true });
  }

  // ---- Flow condition + ingest token ----
  if (path === "/api/flow-condition" && m === "GET") {
    const senders = await listSenders(env.DB, userId);
    return json({
      ok: true,
      condition: buildFlowCondition(senders),
      ingestUrl: ingestUrl(env),
      bodyTemplate: ingestBodyTemplate(),
    });
  }
  if (path === "/api/ingest-token" && m === "POST") {
    // Generate a fresh token; store only its hash. Plaintext is returned once.
    const token = randomToken();
    await setIngestToken(env.DB, userId, await sha256Hex(token));
    return json({ ok: true, token, ingestUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/ingest` });
  }

  // ---- Call log ----
  if (path === "/api/call-log" && m === "GET") {
    return json({ ok: true, calls: await listCallLog(env.DB, userId, 50) });
  }

  // ---- Delete account ----
  if (path === "/api/account" && m === "DELETE") {
    await deleteUser(env.DB, userId);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  return json({ ok: false, error: "not found" }, 404);
}

function clampMin(v: unknown): number | null {
  if (!Number.isInteger(v)) return null;
  const n = v as number;
  if (n < 0 || n > 1439) return null;
  return n;
}
