import { claimCode, hashValue, remainingCount } from "./claim.js";

const PRODUCTION_ORIGIN = "https://hearingassistant.app";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function originAllowed(origin) {
  if (!origin || origin === "null") return false;
  if (origin === PRODUCTION_ORIGIN) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

function corsHeaders(origin) {
  const headers = { vary: "Origin" };
  if (!origin || !originAllowed(origin)) return headers;
  headers["access-control-allow-origin"] = origin;
  headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
  headers["access-control-allow-headers"] = "Content-Type";
  headers["access-control-max-age"] = "86400";
  return headers;
}

function json(status, payload, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

function minElapsedMs(env) {
  const n = Number(env?.MIN_ELAPSED_MS);
  if (!Number.isFinite(n) || n < 0) return 1500;
  return n;
}

function routePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);
    const path = routePath(url.pathname);

    if (request.method === "OPTIONS") {
      if (origin && !originAllowed(origin)) {
        return new Response(null, { status: 403, headers: corsHeaders(origin) });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (path === "/status") {
        if (request.method !== "GET") {
          return json(405, { error: "method_not_allowed" }, origin);
        }
        const remaining = await remainingCount(env.DB);
        return new Response(String(remaining), {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
            ...corsHeaders(origin),
          },
        });
      }

      if (path === "/claim") {
        if (request.method !== "POST") {
          return json(405, { error: "method_not_allowed" }, origin);
        }
        return await handleClaim(request, env, origin);
      }

      return json(404, { error: "not_found" }, origin);
    } catch {
      return json(500, { error: "error" }, origin);
    }
  },
};

async function handleClaim(request, env, origin) {
  if (origin && !originAllowed(origin)) {
    return json(403, { error: "forbidden" }, origin);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json(400, { error: "bad_request" }, origin);
  }

  const salt = env.HASH_SALT;
  if (!salt || String(salt).length < 16) {
    return json(503, { error: "not_configured" }, origin);
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return json(400, { error: "bad_request" }, origin);
  }
  if (text.length > 2000) return json(400, { error: "bad_request" }, origin);

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "bad_request" }, origin);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { error: "bad_request" }, origin);
  }

  const elapsed = body.elapsedMs;
  if (typeof elapsed !== "number" || !Number.isFinite(elapsed) || elapsed > 24 * 60 * 60 * 1000) {
    return json(400, { error: "bad_request" }, origin);
  }
  if (elapsed < minElapsedMs(env)) {
    return json(400, { error: "too_fast" }, origin);
  }

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().toLowerCase() : "";
  if (!UUID_RE.test(deviceId)) {
    return json(400, { error: "bad_request" }, origin);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!ip || ip.length > 128) {
    return json(400, { error: "bad_request" }, origin);
  }

  const [deviceHash, ipHash] = await Promise.all([
    hashValue(salt, `device:${deviceId}`),
    hashValue(salt, `ip:${ip}`),
  ]);

  const result = await claimCode(env.DB, {
    deviceHash,
    ipHash,
    now: new Date().toISOString(),
  });

  if (!result.ok) {
    return json(409, { error: "sold_out" }, origin);
  }
  return json(200, { code: result.code, repeat: result.repeat }, origin);
}
