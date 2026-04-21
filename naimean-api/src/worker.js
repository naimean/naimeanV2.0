import { Agent, routeAgentRequest } from "agents";

export class NaimeanAgent extends Agent {
  #schemaReady = false;

  async ensureSchema() {
    if (this.#schemaReady) {
      return;
    }
    this.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;
    this.#schemaReady = true;
  }

  async onRequest(request) {
    await this.ensureSchema();
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      const count = (await this.state.storage.get("request_count")) || 0;
      await this.state.storage.put("request_count", count + 1);
      return Response.json({
        agent: "naimean-agent",
        instance: this.name,
        requestCount: count + 1,
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      try {
        const { message } = await request.json();
        if (!message || typeof message !== "string") {
          return Response.json({ error: "message is required" }, { status: 400 });
        }

        this.sql`INSERT INTO messages (role, content) VALUES ('user', ${message})`;
        const reply = `Echo: ${message}`;
        this.sql`INSERT INTO messages (role, content) VALUES ('assistant', ${reply})`;

        return Response.json({ reply, instance: this.name });
      } catch (err) {
        return Response.json({ error: err?.message || "internal error" }, { status: 500 });
      }
    }

    if (url.pathname === "/history") {
      const messages = this.sql`SELECT * FROM messages ORDER BY created_at ASC`;
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
        this.sql`INSERT INTO messages (role, content) VALUES ('user', ${data.message})`;
        const reply = `Echo: ${data.message}`;
        this.sql`INSERT INTO messages (role, content) VALUES ('assistant', ${reply})`;
        ws.send(JSON.stringify({ type: "reply", reply, instance: this.name }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", error: err?.message || "invalid message" }));
    }
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function unauthorized() {
  return jsonResponse({ error: "Unauthorized — provide Authorization: Bearer <token>" }, 401);
}

function isAuthorized(request, env) {
  const expected = env.API_TOKEN;
  if (!expected) {
    return true;
  }
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${expected}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "");

    if (request.method === "OPTIONS") {
      return jsonResponse({ ok: true }, 204);
    }

    if (path === "/health" || path === "/status") {
      return jsonResponse({
        ok: true,
        service: "naimean-api",
        durableObject: "NaimeanAgent",
      });
    }

    if (!isAuthorized(request, env)) {
      return unauthorized();
    }

    const routedRequest = new Request(`https://agent${path || "/"}`, request);
    return routeAgentRequest(routedRequest, env);
  },
};
