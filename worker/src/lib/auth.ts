import type { Env } from "../types";
import { upsertUserByOid } from "./db";
import { randomToken } from "./crypto";
import { json } from "./util";
import {
  clearStateCookie,
  makeSessionCookie,
  makeStateCookie,
  verifyStateCookie,
} from "./session";

const SCOPES = "openid profile email User.Read";

function authorizeUrl(env: Env): string {
  return `https://login.microsoftonline.com/${env.ENTRA_TENANT}/oauth2/v2.0/authorize`;
}
function tokenUrl(env: Env): string {
  return `https://login.microsoftonline.com/${env.ENTRA_TENANT}/oauth2/v2.0/token`;
}
function redirectUri(env: Env): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/api/auth/callback`;
}

/** GET /api/auth/login → redirect to Entra. */
export async function handleLogin(env: Env): Promise<Response> {
  const state = randomToken();
  const params = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(env),
    response_mode: "query",
    scope: SCOPES,
    state,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${authorizeUrl(env)}?${params}`,
      "Set-Cookie": await makeStateCookie(env, state),
    },
  });
}

interface IdTokenClaims {
  oid?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  aud?: string;
  exp?: number;
}

function decodeJwtPayload(jwt: string): IdTokenClaims | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? "" : "=".repeat(4 - (parts[1].length % 4));
    const jsonStr = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad);
    return JSON.parse(jsonStr) as IdTokenClaims;
  } catch {
    return null;
  }
}

/** GET /api/auth/callback?code=...&state=... */
export async function handleCallback(req: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const err = url.searchParams.get("error");
  if (err) return json({ ok: false, error: `entra: ${err}` }, 400);
  if (!code) return json({ ok: false, error: "missing code" }, 400);
  if (!(await verifyStateCookie(req, env, state))) {
    return json({ ok: false, error: "invalid state" }, 400);
  }

  // Exchange the code for tokens (confidential client — server-to-server).
  const body = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    client_secret: env.ENTRA_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri(env),
    grant_type: "authorization_code",
    scope: SCOPES,
  });
  const tokenResp = await fetch(tokenUrl(env), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResp.ok) {
    return json({ ok: false, error: "token exchange failed", detail: await tokenResp.text() }, 502);
  }
  const tokens = (await tokenResp.json()) as { id_token?: string };
  if (!tokens.id_token) return json({ ok: false, error: "no id_token" }, 502);

  const claims = decodeJwtPayload(tokens.id_token);
  // The token came directly from Microsoft's token endpoint over TLS; still
  // validate audience and expiry defensively. (JWKS signature verification is a
  // documented hardening follow-up.)
  if (!claims || claims.aud !== env.ENTRA_CLIENT_ID) {
    return json({ ok: false, error: "invalid id_token audience" }, 400);
  }
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    return json({ ok: false, error: "id_token expired" }, 400);
  }
  const oid = claims.oid || claims.sub;
  if (!oid) return json({ ok: false, error: "id_token missing subject" }, 400);

  const email = claims.email || claims.preferred_username || null;
  const name = claims.name || null;
  const user = await upsertUserByOid(env.DB, oid, email, name);

  // Set the session and clear the state cookie, then land on the app.
  const headers = new Headers();
  headers.append("Set-Cookie", await makeSessionCookie(env, user.id));
  headers.append("Set-Cookie", clearStateCookie());
  headers.set("Location", `${env.APP_BASE_URL.replace(/\/$/, "")}/`);
  return new Response(null, { status: 302, headers });
}
