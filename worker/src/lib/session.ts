import type { Env } from "../types";
import { hmacHex } from "./crypto";
import { safeEqual } from "./util";

const COOKIE_NAME = "ptc_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

interface SessionData {
  uid: string;
  exp: number; // unix seconds
}

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

/** Create a signed session cookie value for a user. */
export async function makeSessionCookie(env: Env, userId: string): Promise<string> {
  const data: SessionData = { uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC };
  const payload = b64urlEncode(JSON.stringify(data));
  const sig = await hmacHex(env.SESSION_SECRET, payload);
  const value = `${payload}.${sig}`;
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SEC}`;
}

/** Cookie header that clears the session. */
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** Verify the session cookie and return the user id, or null. */
export async function getSessionUserId(req: Request, env: Env): Promise<string | null> {
  const raw = readCookie(req, COOKIE_NAME);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await hmacHex(env.SESSION_SECRET, payload);
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload)) as SessionData;
    if (!data.uid || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.uid;
  } catch {
    return null;
  }
}

// ---- Short-lived OAuth state cookie (CSRF + PKCE-ish nonce) ----

const STATE_COOKIE = "ptc_oauth";

export async function makeStateCookie(env: Env, state: string): Promise<string> {
  const sig = await hmacHex(env.SESSION_SECRET, state);
  return `${STATE_COOKIE}=${state}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function verifyStateCookie(req: Request, env: Env, state: string): Promise<boolean> {
  const raw = readCookie(req, STATE_COOKIE);
  if (!raw) return false;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return false;
  const value = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await hmacHex(env.SESSION_SECRET, value);
  return safeEqual(sig, expected) && safeEqual(value, state);
}
