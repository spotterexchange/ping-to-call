import type { Env } from "../types";
import { createUser, getUserByEmail } from "./db";
import { hashPassword, verifyPassword } from "./crypto";
import { json } from "./util";
import { makeSessionCookie } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Failed-login throttle: max attempts per IP per window.
const MAX_FAILS = 10;
const WINDOW_SEC = 600;

async function readCreds(req: Request): Promise<{ email: string; password: string } | null> {
  try {
    const b = (await req.json()) as { email?: string; password?: string };
    if (typeof b.email !== "string" || typeof b.password !== "string") return null;
    return { email: b.email, password: b.password };
  } catch {
    return null;
  }
}

function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") || "unknown";
}

async function tooManyFails(env: Env, ip: string): Promise<boolean> {
  const n = parseInt((await env.PING_KV.get(`loginfail:${ip}`)) || "0", 10);
  return n >= MAX_FAILS;
}

async function recordFail(env: Env, ip: string): Promise<void> {
  const key = `loginfail:${ip}`;
  const n = parseInt((await env.PING_KV.get(key)) || "0", 10) + 1;
  await env.PING_KV.put(key, String(n), { expirationTtl: WINDOW_SEC });
}

function sessionResponse(cookie: string, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "Set-Cookie": cookie },
  });
}

/** POST /api/auth/signup { email, password } */
export async function handleSignup(req: Request, env: Env): Promise<Response> {
  const creds = await readCreds(req);
  if (!creds) return json({ ok: false, error: "invalid json" }, 400);
  const email = creds.email.trim();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "enter a valid email" }, 400);
  if (creds.password.length < MIN_PASSWORD) {
    return json({ ok: false, error: `password must be at least ${MIN_PASSWORD} characters` }, 400);
  }
  if (await getUserByEmail(env.DB, email)) {
    return json({ ok: false, error: "an account with that email already exists" }, 409);
  }
  const user = await createUser(env.DB, email, await hashPassword(creds.password));
  return sessionResponse(await makeSessionCookie(env, user.id), { ok: true });
}

/** POST /api/auth/login { email, password } */
export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const ip = clientIp(req);
  if (await tooManyFails(env, ip)) {
    return json({ ok: false, error: "too many attempts, try again later" }, 429);
  }
  const creds = await readCreds(req);
  if (!creds) return json({ ok: false, error: "invalid json" }, 400);

  const user = await getUserByEmail(env.DB, creds.email);
  // Always run a verify to keep timing consistent whether or not the user exists.
  const ok = user
    ? await verifyPassword(creds.password, user.password_hash)
    : await verifyPassword(creds.password, "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!user || !ok) {
    await recordFail(env, ip);
    return json({ ok: false, error: "invalid email or password" }, 401);
  }
  return sessionResponse(await makeSessionCookie(env, user.id), { ok: true });
}
