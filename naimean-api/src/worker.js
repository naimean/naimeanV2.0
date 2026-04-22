/**
 * naimean-api Worker
 *
 * Cloudflare Worker serving the REST API at naimean.com/api/*.
 * Backed by D1 (SQLite at the edge) with KV available for future use.
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
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SECURITY_HEADERS,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === "/api/health" && method === "GET") {
        return jsonResponse({ status: "ok", timestamp: new Date().toISOString() });
      }

      if (pathname === "/api/data" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, title, content, created_at FROM entries ORDER BY created_at DESC LIMIT 50"
        ).all();
        return jsonResponse(result.results);
      }

      if (pathname === "/api/data" && method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON body" }, 400);
        }

        const title = body && typeof body.title === "string" ? body.title.trim() : "";
        if (!title) {
          return jsonResponse({ error: "title is required" }, 400);
        }

        const content = body && typeof body.content === "string" ? body.content : null;

        await env.DB.prepare("INSERT INTO entries (title, content) VALUES (?, ?)").bind(title, content).run();

        return jsonResponse({ success: true }, 201);
      }

      return jsonResponse("naimean.com API — use /api/health or /api/data", 404);
    } catch {
      return jsonResponse({ error: "internal server error" }, 500);
    }
  },
};
