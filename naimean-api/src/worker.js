/**
 * naimean-api Worker
 *
 * Cloudflare Worker serving the REST API at naimean.com/api/*.
 * Backed by D1 (SQLite at the edge) with KV available for future use.
 * Current repo behavior keeps /api/* public; no API token is enforced here.
 *
 * Bindings required (configured in wrangler.toml):
 *   DB  →  naimean-db  (D1 database)
 *   KV  →  naimean-kv  (Workers KV — create namespace first, see wrangler.toml)
 *
 * Endpoints:
 *   GET  /api/health  – health check
 *   GET  /api/data    – list entries (latest 50, ordered by created_at DESC)
 *   POST /api/data    – create a new entry  { "title": "...", "content": "..." }
 *   *    other paths  – 404
 */

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const SECURITY_HEADERS = {
  "Content-Security-Policy": API_CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
};

function jsonResponse(body, status = 200, isSecureTransport = false) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    ...SECURITY_HEADERS,
  };

  if (isSecureTransport) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    const isSecureTransport = url.protocol === "https:";

    try {
      if (pathname === "/api/health" && method === "GET") {
        return jsonResponse({ status: "ok", timestamp: new Date().toISOString() }, 200, isSecureTransport);
      }

      if (pathname === "/api/data" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, title, content, created_at FROM entries ORDER BY created_at DESC LIMIT 50"
        ).all();
        return jsonResponse(result.results, 200, isSecureTransport);
      }

      if (pathname === "/api/data" && method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON body" }, 400, isSecureTransport);
        }

        const title = body && typeof body.title === "string" ? body.title.trim() : "";
        if (!title) {
          return jsonResponse({ error: "title is required" }, 400, isSecureTransport);
        }

        const content = body && typeof body.content === "string" ? body.content : null;

        await env.DB.prepare("INSERT INTO entries (title, content) VALUES (?, ?)").bind(title, content).run();

        return jsonResponse({ success: true }, 201, isSecureTransport);
      }

      return jsonResponse("naimean.com API — use /api/health or /api/data", 404, isSecureTransport);
    } catch (err) {
      console.error("naimean-api request failed", err);
      return jsonResponse({ error: "internal server error" }, 500, isSecureTransport);
    }
  },
};
