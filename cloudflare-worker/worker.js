/**
 * barrelroll-counter-worker
 *
 * Cloudflare Worker that tracks the rickroll/barrel-roll counter using D1.
 *
 * Bindings required (set in wrangler.toml or the Cloudflare dashboard):
 *   DB  →  barrelroll-counter-db  (D1 database)
 *
 * Endpoints:
 *   GET  /get  – return the current counter value
 *   GET  /hit  – increment the counter by 1, return the new value
 *
 * Counter endpoints return JSON: { "value": <integer> }
 */

const COUNTER_ID = 'rickrolls';

function corsHeaders(origin) {
  const allowOrigin = origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { pathname } = new URL(request.url);

    // Handle CORS pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
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

      // ── Fallthrough ───────────────────────────────────────────────────────
      if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405, origin);
      }

      return jsonResponse({ error: 'Not found' }, 404, origin);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500, origin);
    }
  },
};
