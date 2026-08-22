/**
 * Ping-to-Call — Cloudflare Worker (call side)
 *
 * Receives a webhook when your boss messages you on Microsoft Teams and places
 * a phone call to your cell via Twilio. The call, from a number you've marked
 * "Emergency Bypass" on your iPhone, rings through Do Not Disturb / sleep.
 *
 * This half is deliberately independent of *how* the Teams message is detected
 * (Power Automate or Microsoft Graph). Anything that can POST JSON + a shared
 * secret to /ping can drive it.
 *
 * Endpoints:
 *   GET  /health          liveness probe
 *   GET  /twiml           preview the spoken message as TwiML (debug)
 *   POST /test            place a test call immediately (secret-protected)
 *   POST /ping            main webhook the detector calls (secret-protected)
 */

export interface Env {
  // Secrets (wrangler secret put ...)
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM: string;
  MY_PHONE: string;
  WEBHOOK_SECRET: string;

  // Vars (wrangler.toml [vars])
  BOSS_IDENTIFIERS: string;
  SPEAK_CONTENT: string;
  MIN_SECONDS_BETWEEN_CALLS: string;
  DEDUPE_TTL_SECONDS: string;
  SAY_VOICE: string;

  // KV
  PING_KV: KVNamespace;
}

interface PingPayload {
  sender?: string;
  senderEmail?: string;
  message?: string;
  isMention?: boolean;
  isDirectMessage?: boolean;
  chatId?: string;
  messageId?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** XML-escape text so it is safe inside a TwiML <Say> element. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Constant-time-ish string comparison to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Build the TwiML the call will speak. */
function buildTwiml(env: Env, opts: { name: string; message: string }): string {
  const voice = env.SAY_VOICE || "Polly.Joanna";
  const speakContent = (env.SPEAK_CONTENT ?? "true").toLowerCase() === "true";
  const name = opts.name?.trim() || "your boss";

  const intro = `Urgent. ${name} messaged you on Teams.`;
  const body =
    speakContent && opts.message?.trim()
      ? opts.message.trim()
      : "Check Microsoft Teams now.";

  const say = (t: string) => `<Say voice="${xmlEscape(voice)}">${xmlEscape(t)}</Say>`;

  // Read it, pause, then repeat once so a groggy listener catches it.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    say(intro) +
    say(body) +
    `<Pause length="1"/>` +
    say("Message repeats.") +
    say(intro) +
    say(body) +
    `</Response>`
  );
}

/** Does the sender match one of the configured boss identifiers? */
function matchesBoss(env: Env, sender?: string, senderEmail?: string): boolean {
  const ids = (env.BOSS_IDENTIFIERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (ids.length === 0) return false;

  const name = (sender || "").toLowerCase();
  const email = (senderEmail || "").toLowerCase();

  return ids.some(
    (id) => (email && email === id) || (name && (name === id || name.includes(id))),
  );
}

/** Place the outbound call through Twilio's REST API. */
async function placeCall(env: Env, twiml: string): Promise<Response> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json`;
  const form = new URLSearchParams({
    To: env.MY_PHONE,
    From: env.TWILIO_FROM,
    Twiml: twiml,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  return resp;
}

/** Check the shared secret header. */
function authorized(req: Request, env: Env): boolean {
  const provided = req.headers.get("X-Ping-Secret") || "";
  return Boolean(env.WEBHOOK_SECRET) && safeEqual(provided, env.WEBHOOK_SECRET);
}

async function handlePing(req: Request, env: Env): Promise<Response> {
  if (!authorized(req, env)) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: PingPayload;
  try {
    payload = (await req.json()) as PingPayload;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const { sender, senderEmail, message, isMention, isDirectMessage, messageId } =
    payload;

  // 1. Boss match.
  if (!matchesBoss(env, sender, senderEmail)) {
    return json({ ok: true, action: "ignored", reason: "not from boss" });
  }

  // 2. Trigger rule: a DM or an @mention qualifies. If the detector supplies
  //    neither flag, we trust that it already filtered (Power Automate does).
  const flagsProvided = isMention !== undefined || isDirectMessage !== undefined;
  const qualifies = !flagsProvided || isMention === true || isDirectMessage === true;
  if (!qualifies) {
    return json({ ok: true, action: "ignored", reason: "not a DM or mention" });
  }

  // 3. De-dupe on messageId.
  if (messageId) {
    const key = `msg:${messageId}`;
    if (await env.PING_KV.get(key)) {
      return json({ ok: true, action: "ignored", reason: "duplicate messageId" });
    }
    const ttl = Math.max(60, parseInt(env.DEDUPE_TTL_SECONDS || "3600", 10));
    await env.PING_KV.put(key, "1", { expirationTtl: ttl });
  }

  // 4. Rate-limit: at most one call per MIN_SECONDS_BETWEEN_CALLS.
  const minGap = Math.max(0, parseInt(env.MIN_SECONDS_BETWEEN_CALLS || "120", 10));
  const now = Math.floor(Date.now() / 1000);
  const last = parseInt((await env.PING_KV.get("lastcall")) || "0", 10);
  if (minGap > 0 && now - last < minGap) {
    return json({
      ok: true,
      action: "ignored",
      reason: `rate-limited (${minGap - (now - last)}s left)`,
    });
  }

  // 5. Place the call.
  const twiml = buildTwiml(env, { name: sender || "your boss", message: message || "" });
  const resp = await placeCall(env, twiml);
  if (!resp.ok) {
    const detail = await resp.text();
    return json({ ok: false, action: "call_failed", status: resp.status, detail }, 502);
  }

  await env.PING_KV.put("lastcall", String(now));
  const data = (await resp.json()) as { sid?: string };
  return json({ ok: true, action: "called", callSid: data.sid ?? null });
}

async function handleTest(req: Request, env: Env): Promise<Response> {
  if (!authorized(req, env)) return json({ ok: false, error: "unauthorized" }, 401);

  const twiml = buildTwiml(env, {
    name: "your boss",
    message: "This is a test of your Teams boss alert. It works.",
  });
  const resp = await placeCall(env, twiml);
  if (!resp.ok) {
    const detail = await resp.text();
    return json({ ok: false, action: "call_failed", status: resp.status, detail }, 502);
  }
  const data = (await resp.json()) as { sid?: string };
  return json({ ok: true, action: "test_called", callSid: data.sid ?? null });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "ping-to-call", time: new Date().toISOString() });
    }

    if (req.method === "GET" && url.pathname === "/twiml") {
      // Debug preview — does NOT place a call.
      const twiml = buildTwiml(env, {
        name: url.searchParams.get("name") || "your boss",
        message: url.searchParams.get("msg") || "Sample message.",
      });
      return new Response(twiml, { headers: { "content-type": "text/xml" } });
    }

    if (req.method === "POST" && url.pathname === "/test") {
      return handleTest(req, env);
    }

    if (req.method === "POST" && url.pathname === "/ping") {
      return handlePing(req, env);
    }

    return json({ ok: false, error: "not found" }, 404);
  },
};
