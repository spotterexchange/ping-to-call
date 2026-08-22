import type { Env } from "./types";
import { json } from "./lib/util";
import { handleCallback, handleLogin } from "./lib/auth";
import { handleApi } from "./lib/api";
import { handleIngest } from "./lib/ingest";
import { clearSessionCookie, getSessionUserId } from "./lib/session";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Liveness.
    if (req.method === "GET" && path === "/health") {
      return json({ ok: true, service: "ping-to-call", time: new Date().toISOString() });
    }

    // Detector webhook (per-user token auth, metadata only).
    if (req.method === "POST" && path === "/ingest") {
      return handleIngest(req, env);
    }

    // Auth (no session required).
    if (req.method === "GET" && path === "/api/auth/login") {
      return handleLogin(env);
    }
    if (req.method === "GET" && path === "/api/auth/callback") {
      return handleCallback(req, env, url);
    }
    if (path === "/api/auth/logout" && (req.method === "POST" || req.method === "GET")) {
      const headers = new Headers();
      headers.append("Set-Cookie", clearSessionCookie());
      if (req.method === "GET") {
        headers.set("Location", `${env.APP_BASE_URL.replace(/\/$/, "")}/`);
        return new Response(null, { status: 302, headers });
      }
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    // Everything else under /api requires a valid session.
    if (path.startsWith("/api/")) {
      const userId = await getSessionUserId(req, env);
      if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
      return handleApi(req, env, userId, url);
    }

    // Static SPA is served by the [assets] binding once web/dist is built.
    // If assets aren't configured yet, return a simple placeholder.
    return json({ ok: false, error: "not found" }, 404);
  },
};
