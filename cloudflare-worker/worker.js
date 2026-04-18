/**
 * barrelroll-counter-worker
 *
 * Cloudflare Worker that tracks the rickroll/barrel-roll counter using D1,
 * and handles remote router reboot commands for the RS200 Nighthawk.
 *
 * Bindings required (set in wrangler.toml or the Cloudflare dashboard):
 *   DB            →  barrelroll-counter-db  (D1 database)
 *   ROUTER_SECRET →  set via: wrangler secret put ROUTER_SECRET
 *
 * Endpoints:
 *   GET  /get            – return the current counter value
 *   GET  /hit            – increment the counter by 1, return the new value
 *   POST /router/reboot  – queue a router reboot   (requires X-Router-Secret header)
 *   GET  /router/status  – return { pending: bool } (requires X-Router-Secret header)
 *   POST /router/ack     – clear the pending flag   (requires X-Router-Secret header)
 *
 * Counter endpoints return JSON: { "value": <integer> }
 * Router endpoints return JSON:  { "ok": true } or { "pending": bool } or { "error": "..." }
 */

const COUNTER_ID = 'rickrolls';
const ROUTER_CMD_ID = 'reboot';

/**
 * Origins that are allowed to call this worker.
 * Add your production and preview origins here.
 */
const ALLOWED_ORIGINS = [
  'https://naimean.com',
  'https://www.naimean.com',
  // Allow local development
  'http://localhost',
  'http://127.0.0.1',
];

function corsHeaders(origin, allowPost = false) {
  if (!ALLOWED_ORIGINS.includes(origin)) {
    // Origin not in allowlist – omit the ACAO header so browsers block the request.
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': allowPost ? 'GET, POST, OPTIONS' : 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Router-Secret',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, origin, allowPost = false) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin, allowPost),
    },
  });
}

function isRouterAuthed(request, env) {
  const secret = request.headers.get('X-Router-Secret');
  return Boolean(secret && env.ROUTER_SECRET && secret === env.ROUTER_SECRET);
}

async function getCount(db) {
  const row = await db
    .prepare('SELECT value FROM rickroll_counter WHERE id = ?')
    .bind(COUNTER_ID)
    .first();
  return row ? row.value : 0;
}

async function incrementCount(db) {
  // Use RETURNING to atomically increment and return the new value in one statement.
  const row = await db
    .prepare('UPDATE rickroll_counter SET value = value + 1 WHERE id = ? RETURNING value')
    .bind(COUNTER_ID)
    .first();
  return row ? row.value : 0;
}

async function getRouterPending(db) {
  const row = await db
    .prepare('SELECT pending FROM router_commands WHERE id = ?')
    .bind(ROUTER_CMD_ID)
    .first();
  return row ? row.pending === 1 : false;
}

async function setRouterPending(db, pending) {
  const now = pending ? new Date().toISOString() : null;
  await db
    .prepare('UPDATE router_commands SET pending = ?, requested_at = ? WHERE id = ?')
    .bind(pending ? 1 : 0, now, ROUTER_CMD_ID)
    .run();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { pathname } = new URL(request.url);
    const isRouterPath = pathname.startsWith('/router/');

    // Handle CORS pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, isRouterPath) });
    }

    try {
      // ── Counter routes (GET only) ─────────────────────────────────────────
      if (request.method === 'GET' && pathname === '/get') {
        const value = await getCount(env.DB);
        return jsonResponse({ value }, 200, origin);
      }

      if (request.method === 'GET' && pathname === '/hit') {
        const value = await incrementCount(env.DB);
        return jsonResponse({ value }, 200, origin);
      }

      // ── Router routes (authenticated) ────────────────────────────────────
      if (isRouterPath) {
        if (!isRouterAuthed(request, env)) {
          return jsonResponse({ error: 'Unauthorized' }, 401, origin, true);
        }

        if (pathname === '/router/reboot' && request.method === 'POST') {
          await setRouterPending(env.DB, true);
          return jsonResponse({ ok: true }, 200, origin, true);
        }

        if (pathname === '/router/status' && request.method === 'GET') {
          const pending = await getRouterPending(env.DB);
          return jsonResponse({ pending }, 200, origin, true);
        }

        if (pathname === '/router/ack' && request.method === 'POST') {
          await setRouterPending(env.DB, false);
          return jsonResponse({ ok: true }, 200, origin, true);
        }

        return jsonResponse({ error: 'Not found' }, 404, origin, true);
      }

      // ── Fallthrough ───────────────────────────────────────────────────────
      if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405, origin);
      }

      return jsonResponse({ error: 'Not found' }, 404, origin);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500, origin, isRouterPath);
    }
  },
};
