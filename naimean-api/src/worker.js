import { Agent, routeAgentRequest } from "agents";

const TOKEN_ENCODER = new TextEncoder();

export class NaimeanAgent extends Agent {
  #schemaReady = false;
  #schemaInitPromise = null;

  async ensureSchema() {
    if (this.#schemaReady) {
      return;
    }

    if (!this.#schemaInitPromise) {
      this.#schemaInitPromise = (async () => {
        await this.sql`
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `;
        this.#schemaReady = true;
      })();
    }

    await this.#schemaInitPromise;
  }

  async onRequest(request) {
    await this.ensureSchema();
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      const count = await this.state.storage.transaction(async (txn) => {
        const current = (await txn.get("request_count")) || 0;
        const next = current + 1;
        await txn.put("request_count", next);
        return next;
      });
      return Response.json({
        agent: "naimean-agent",
        instance: this.name,
        requestCount: count,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const { message } = await request.json();
        if (!message || typeof message !== "string") {
          return Response.json({ error: "message is required" }, { status: 400 });
        }

        await this.sql`INSERT INTO messages (role, content) VALUES ('user', ${message})`;
        const reply = `Echo: ${message}`;
        await this.sql`INSERT INTO messages (role, content) VALUES ('assistant', ${reply})`;

        return Response.json({ reply, instance: this.name });
      } catch (err) {
        return Response.json({ error: err?.message || "internal error" }, { status: 500 });
      }
    }

    if (url.pathname === "/history") {
      const messages = await this.sql`SELECT * FROM messages ORDER BY created_at ASC`;
      return Response.json({ messages, instance: this.name });
    }

    return Response.json({
      agent: "naimean-agent",
      instance: this.name,
      endpoints: {
        status: "GET /status",
        chat: "POST /chat { message: string }",
        history: "GET /history",
      },
    });
  }

  async onConnect(ws) {
    await this.ensureSchema();
    ws.send(JSON.stringify({ type: "connected", instance: this.name }));
  }

  async onMessage(ws, message) {
    await this.ensureSchema();
    try {
      const data = JSON.parse(message);
      if (data.type === "chat" && data.message) {
        await this.sql`INSERT INTO messages (role, content) VALUES ('user', ${data.message})`;
        const reply = `Echo: ${data.message}`;
        await this.sql`INSERT INTO messages (role, content) VALUES ('assistant', ${reply})`;
        ws.send(JSON.stringify({ type: "reply", reply, instance: this.name }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", error: err?.message || "invalid message" }));
    }
  }
}

function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const configured = (env.CORS_ALLOWED_ORIGINS || "https://naimean.com,https://www.naimean.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin && configured.includes(origin)) {
    return origin;
  }

  return configured[0] || "https://naimean.com";
}

function jsonResponse(request, env, data, status = 200) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(request, env),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };

  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function unauthorized(request, env) {
  return jsonResponse(request, env, { error: "Unauthorized — provide Authorization: Bearer <token>" }, 401);
}

function constantTimeEqual(a, b) {
  const left = TOKEN_ENCODER.encode(String(a));
  const right = TOKEN_ENCODER.encode(String(b));
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < maxLength; i += 1) {
    const l = i < left.length ? left[i] : 0;
    const r = i < right.length ? right[i] : 0;
    diff |= l ^ r;
  }

  return diff === 0;
}

function isAuthorized(request, env) {
  const expected = env.API_TOKEN;
  if (!expected) {
    return false;
  }
  const auth = request.headers.get("Authorization") || "";
  return constantTimeEqual(auth, `Bearer ${expected}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "");

    if (request.method === "OPTIONS") {
      return jsonResponse(request, env, null, 204);
    }

    if (path === "/health") {
      return jsonResponse(request, env, {
        ok: true,
        service: "naimean-api",
        durableObject: "NaimeanAgent",
      });
    }

    if (!isAuthorized(request, env)) {
      return unauthorized(request, env);
    }

    const targetUrl = new URL(request.url);
    targetUrl.pathname = path || "/";
    const routedRequest = new Request(targetUrl, request);
    return routeAgentRequest(routedRequest, env);
  },
};
