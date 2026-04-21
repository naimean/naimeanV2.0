/**
 * Unit tests for cloudflare-worker/worker.js utility functions.
 *
 * Run with: node --test cloudflare-worker/worker.test.js
 *
 * These tests exercise pure utility functions that can be extracted and
 * validated without a full Cloudflare Workers runtime.  They are intended
 * to catch regressions in URL/cookie/token helpers and CORS logic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

// ─── Inline copies of the pure helpers from worker.js ────────────────────────
// We duplicate the helpers here so the tests run under plain Node.js without
// needing a Workers-compatible bundler or Miniflare.

const textEncoder = new TextEncoder();
const TRUE_LIKE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

function normalizeOriginUrl(url) {
  return `${url.protocol}//${url.host}`.toLowerCase();
}

function isValidHostnameSuffix(value) {
  if (!value || value.startsWith('.') || value.endsWith('.')) return false;
  const labels = value.split('.');
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

function isNonProductionEnvironment(env) {
  const rawValue = typeof env.APP_ENV === 'string'
    ? env.APP_ENV
    : (typeof env.ENVIRONMENT === 'string' ? env.ENVIRONMENT : '');
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return false;
  return normalized !== 'production' && normalized !== 'prod';
}

function isEnabledEnvFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return TRUE_LIKE_ENV_VALUES.has(value.trim().toLowerCase());
}

function parseAllowedOriginList(value, env) {
  if (!value || typeof value !== 'string') return [];
  const items = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const normalizedOrigins = [];
  for (const item of items) {
    try {
      const url = new URL(item);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      normalizedOrigins.push(normalizeOriginUrl(url));
    } catch (_error) {
      // Keep parity with worker behavior: invalid entries are ignored.
    }
  }
  return normalizedOrigins;
}

function parseAllowedHostnameSuffixes(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => isValidHostnameSuffix(entry));
}

function getAllowedHostnameSuffixes(env) {
  const allowSuffixesInProd = isEnabledEnvFlag(env.CORS_ALLOW_PROD_ORIGIN_SUFFIXES);
  if (!isNonProductionEnvironment(env) && !allowSuffixesInProd) {
    return [];
  }
  return parseAllowedHostnameSuffixes(env.CORS_ALLOWED_ORIGIN_SUFFIXES);
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const url = new URL(origin);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const normalizedOrigin = normalizeOriginUrl(url);
  const allowedOrigins = new Set(parseAllowedOriginList(env.CORS_ALLOWED_ORIGINS || '', env));
  if (allowedOrigins.has(normalizedOrigin)) return true;
  const hostname = url.hostname.toLowerCase();
  const allowedSuffixes = getAllowedHostnameSuffixes(env);
  return allowedSuffixes.some((suffix) => hostname.endsWith(`.${suffix}`));
}

function parseCookies(headerValue) {
  if (!headerValue) return {};
  const result = {};
  for (const entry of headerValue.split(';')) {
    const sep = entry.indexOf('=');
    if (sep === -1) continue;
    const key = entry.slice(0, sep).trim();
    const value = entry.slice(sep + 1).trim();
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

function sanitizeReturnPath(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return '/';
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('/')) return '/';
  const lowered = trimmed.toLowerCase();
  if (
    trimmed.startsWith('//')
    || trimmed.includes('\r')
    || trimmed.includes('\n')
    || lowered.includes('%0d')
    || lowered.includes('%0a')
  ) return '/';
  return trimmed;
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${value}`];
  segments.push(`Path=${options.path || '/'}`);
  if (typeof options.maxAge === 'number') {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.httpOnly !== false) segments.push('HttpOnly');
  segments.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) segments.push('Secure');
  return segments.join('; ');
}

function encodeBase64UrlFromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return Buffer.from(binary, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(withPadding, 'base64');
}

function encodeBase64UrlFromString(value) {
  return encodeBase64UrlFromBytes(Buffer.from(value, 'utf-8'));
}

function decodeBase64UrlToString(value) {
  return decodeBase64UrlToBytes(value).toString('utf-8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('isValidHostnameSuffix – valid suffixes', () => {
  assert.ok(isValidHostnameSuffix('example.com'));
  assert.ok(isValidHostnameSuffix('sub.example.com'));
  assert.ok(isValidHostnameSuffix('pages.dev'));
});

test('isValidHostnameSuffix – invalid suffixes', () => {
  assert.strictEqual(isValidHostnameSuffix(''), false);
  assert.strictEqual(isValidHostnameSuffix('.example.com'), false);
  assert.strictEqual(isValidHostnameSuffix('example.com.'), false);
  assert.strictEqual(isValidHostnameSuffix('exam ple.com'), false);
  assert.strictEqual(isValidHostnameSuffix(null), false);
});

test('parseCookies – empty header', () => {
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(null), {});
});

test('parseCookies – single cookie', () => {
  assert.deepEqual(parseCookies('session=abc123'), { session: 'abc123' });
});

test('parseCookies – multiple cookies', () => {
  const result = parseCookies('a=1; b=2; c=three');
  assert.deepEqual(result, { a: '1', b: '2', c: 'three' });
});

test('parseCookies – cookie value with equals sign', () => {
  const result = parseCookies('token=abc.def=ghi');
  assert.strictEqual(result.token, 'abc.def=ghi');
});

test('sanitizeReturnPath – valid paths pass through', () => {
  assert.strictEqual(sanitizeReturnPath('/'), '/');
  assert.strictEqual(sanitizeReturnPath('/home'), '/home');
  assert.strictEqual(sanitizeReturnPath('/a/b?c=d#e'), '/a/b?c=d#e');
});

test('sanitizeReturnPath – external URLs are rejected', () => {
  assert.strictEqual(sanitizeReturnPath('https://evil.com'), '/');
  assert.strictEqual(sanitizeReturnPath('//evil.com'), '/');
});

test('sanitizeReturnPath – newline injection is rejected', () => {
  assert.strictEqual(sanitizeReturnPath('/ok\r\nevil'), '/');
  assert.strictEqual(sanitizeReturnPath('/ok%0Aevil'), '/');
  assert.strictEqual(sanitizeReturnPath('/ok%0Devil'), '/');
});

test('sanitizeReturnPath – null/empty returns /', () => {
  assert.strictEqual(sanitizeReturnPath(null), '/');
  assert.strictEqual(sanitizeReturnPath(''), '/');
  assert.strictEqual(sanitizeReturnPath(42), '/');
});

test('serializeCookie – basic session cookie', () => {
  const cookie = serializeCookie('sess', 'token123', { maxAge: 3600, secure: true });
  assert.ok(cookie.startsWith('sess=token123'));
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Secure'));
  assert.ok(cookie.includes('Max-Age=3600'));
});

test('serializeCookie – clear cookie has Max-Age=0', () => {
  const cookie = serializeCookie('sess', '', { maxAge: 0 });
  assert.ok(cookie.includes('Max-Age=0'));
});

test('base64url round-trip – string', () => {
  const original = 'Hello, World! 🎉';
  const encoded = encodeBase64UrlFromString(original);
  assert.strictEqual(decodeBase64UrlToString(encoded), original);
  // Must not contain standard base64 padding or unsafe chars
  assert.ok(!encoded.includes('='));
  assert.ok(!encoded.includes('+'));
  assert.ok(!encoded.includes('/'));
});

test('normalizeOriginUrl – lowercases host', () => {
  const url = new URL('https://NAIMEAN.COM');
  assert.strictEqual(normalizeOriginUrl(url), 'https://naimean.com');
});

test('isAllowedOrigin – suffix matching is disabled in production by default', () => {
  const env = {
    APP_ENV: 'production',
    CORS_ALLOWED_ORIGIN_SUFFIXES: 'pages.dev',
  };
  assert.strictEqual(isAllowedOrigin('https://preview.pages.dev', env), false);
});

test('isAllowedOrigin – suffix matching works in non-production', () => {
  const env = {
    APP_ENV: 'development',
    CORS_ALLOWED_ORIGIN_SUFFIXES: 'pages.dev',
  };
  assert.strictEqual(isAllowedOrigin('https://preview.pages.dev', env), true);
});

test('isAllowedOrigin – production suffix matching requires explicit opt-in', () => {
  const env = {
    APP_ENV: 'production',
    CORS_ALLOWED_ORIGIN_SUFFIXES: 'pages.dev',
    CORS_ALLOW_PROD_ORIGIN_SUFFIXES: 'true',
  };
  assert.strictEqual(isAllowedOrigin('https://preview.pages.dev', env), true);
});

// ─── Endpoint contract tests (real worker handler with mock D1 binding) ───────
// These tests import the actual exported handler from worker.js and invoke it
// with a minimal mock D1 database.  They validate endpoint routing, response
// shapes, HTTP method enforcement, and security-header presence without
// requiring a live Cloudflare environment.  Node.js 18+ globals (fetch,
// Request, Response, crypto.subtle, btoa/atob) satisfy all worker dependencies.

const mockDb = {
  prepare(_sql) {
    return {
      bind(..._args) {
        return { async first() { return { value: 0 }; } };
      },
    };
  },
};

function makeContractEnv(overrides = {}) {
  return {
    DB: mockDb,
    APP_ENV: 'test',
    CORS_ALLOWED_ORIGINS: 'http://localhost',
    RATE_LIMIT_ENABLED: 'false', // disabled for contract tests; see dedicated rate-limit tests below
    ...overrides,
  };
}

function makeContractRequest(method, path, headers = {}) {
  return new Request(`http://localhost${path}`, { method, headers });
}

test('contract: GET /get returns 200 with a numeric counter value', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/get'), makeContractEnv());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(typeof body.value, 'number');
});

test('contract: POST /hit returns 200 with a numeric counter value', async () => {
  const res = await worker.fetch(makeContractRequest('POST', '/hit'), makeContractEnv());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(typeof body.value, 'number');
});

test('contract: POST /increment is an alias for /hit and returns 200', async () => {
  const res = await worker.fetch(makeContractRequest('POST', '/increment'), makeContractEnv());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(typeof body.value, 'number');
});

test('contract: GET /auth/session returns unauthenticated when no session cookie is present', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/auth/session'), makeContractEnv());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.authenticated, false);
});

test('contract: POST /auth/logout clears the session cookie and returns ok', async () => {
  const res = await worker.fetch(makeContractRequest('POST', '/auth/logout'), makeContractEnv());
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
});

test('contract: OPTIONS preflight on a counter route returns 204', async () => {
  const res = await worker.fetch(
    makeContractRequest('OPTIONS', '/get', { Origin: 'http://localhost' }),
    makeContractEnv(),
  );
  assert.strictEqual(res.status, 204);
});

test('contract: unsupported method on an API route returns 405', async () => {
  const res = await worker.fetch(makeContractRequest('DELETE', '/get'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: GET /go/:tool without a session returns 401', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/go/whiteboard'), makeContractEnv());
  assert.strictEqual(res.status, 401);
});

test('contract: API responses carry required security headers', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/get'), makeContractEnv());
  assert.ok(res.headers.get('Content-Security-Policy'), 'CSP header must be set');
  assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(res.headers.get('X-Frame-Options'), 'DENY');
});

// ─── HTTP method enforcement tests ───────────────────────────────────────────
// Each write/mutation endpoint only accepts a specific method.  Any other
// method must be rejected with 405.

test('contract: GET /hit is rejected with 405 (write endpoint requires POST)', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/hit'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: GET /increment is rejected with 405 (write endpoint requires POST)', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/increment'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: POST /get is rejected with 405 (read endpoint requires GET)', async () => {
  const res = await worker.fetch(makeContractRequest('POST', '/get'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: POST /auth/session is rejected with 405 (session endpoint requires GET)', async () => {
  const res = await worker.fetch(makeContractRequest('POST', '/auth/session'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: GET /auth/logout is rejected with 405 (logout endpoint requires POST)', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/auth/logout'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: POST /auth/discord/login is rejected with 405 (login endpoint requires GET)', async () => {
  const res = await worker.fetch(makeContractRequest('POST', '/auth/discord/login'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: POST /auth/discord/callback is rejected with 405 (callback endpoint requires GET)', async () => {
  const res = await worker.fetch(makeContractRequest('POST', '/auth/discord/callback'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

// ─── Discord OAuth login redirect tests ──────────────────────────────────────

test('contract: GET /auth/discord/login returns 503 when OAuth is not configured', async () => {
  // Default test env has no DISCORD_* vars
  const res = await worker.fetch(makeContractRequest('GET', '/auth/discord/login'), makeContractEnv());
  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

test('contract: GET /auth/discord/login redirects to Discord when fully configured', async () => {
  const oauthEnv = makeContractEnv({
    DISCORD_CLIENT_ID: 'test-client-id',
    DISCORD_CLIENT_SECRET: 'test-client-secret',
    DISCORD_REDIRECT_URI: 'https://naimean.com/auth/discord/callback',
    SESSION_SECRET: 'a-secret-that-is-long-enough-for-hmac',
  });
  const res = await worker.fetch(makeContractRequest('GET', '/auth/discord/login'), oauthEnv);
  // handleDiscordLogin uses createRedirectResponse which returns 302.
  assert.strictEqual(res.status, 302, `expected 302 redirect, got ${res.status}`);
  const location = res.headers.get('Location') || '';
  assert.ok(location.startsWith('https://discord.com/'), `Location must point to Discord, got: ${location}`);
  assert.ok(location.includes('client_id=test-client-id'), 'Location must include client_id');
  assert.ok(location.includes('code_challenge'), 'Location must include PKCE code_challenge');
  // An OAuth cookie must be set to persist the PKCE verifier across the redirect
  const setCookie = res.headers.get('Set-Cookie') || '';
  assert.ok(setCookie.includes('naimean_discord_oauth='), 'OAuth state cookie must be set');
});

// ─── Counter increment mock behavior ─────────────────────────────────────────

test('contract: POST /increment returns an incremented value from D1', async () => {
  // Mock a D1 that simulates a real value of 41 before increment → 42 after.
  const mockDbWithValue = {
    prepare(sql) {
      // The worker uses an UPDATE … RETURNING statement to atomically increment
      // and read back the new value, and a SELECT statement to read-only fetch.
      // We detect which query is in flight by checking for the UPDATE keyword so
      // the mock can return the correct post-increment value.
      const isUpdate = sql.trim().toUpperCase().startsWith('UPDATE');
      return {
        bind(..._args) {
          return {
            async first() {
              // UPDATE … RETURNING returns the new (incremented) value.
              return { value: isUpdate ? 42 : 41 };
            },
          };
        },
      };
    },
  };
  const res = await worker.fetch(
    makeContractRequest('POST', '/increment'),
    makeContractEnv({ DB: mockDbWithValue }),
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.value, 42);
});

// ─── /go/:tool unknown path ───────────────────────────────────────────────────

test('contract: GET /go/unknown returns 401 without a session (auth checked before route lookup)', async () => {
  // Without a valid session the worker short-circuits to 401 before checking
  // whether the tool name is valid, which is the correct behavior.
  const res = await worker.fetch(makeContractRequest('GET', '/go/unknown'), makeContractEnv());
  assert.strictEqual(res.status, 401);
});

// ─── Rate limiting tests ──────────────────────────────────────────────────────
// Each test uses a distinct CF-Connecting-IP so in-process state from one test
// cannot affect another.  Rate limiting is explicitly enabled via the env flag.

function makeRlRequest(method, path, ip) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'CF-Connecting-IP': ip },
    }),
    makeContractEnv({ RATE_LIMIT_ENABLED: 'true' }),
  );
}

test('rate limit: POST /hit allows 10 requests then returns 429', async () => {
  const ip = '198.51.100.1';
  for (let i = 0; i < 10; i++) {
    const res = await makeRlRequest('POST', '/hit', ip);
    assert.strictEqual(res.status, 200, `request ${i + 1} should succeed`);
  }
  const throttled = await makeRlRequest('POST', '/hit', ip);
  assert.strictEqual(throttled.status, 429);
  assert.ok(throttled.headers.get('Retry-After'), 'Retry-After header must be present');
});

test('rate limit: POST /increment shares the /hit bucket', async () => {
  const ip = '198.51.100.2';
  // Interleave 5 /hit and 5 /increment requests – if they share one bucket
  // the combined 10 requests exhaust the window and the 11th is throttled.
  for (let i = 0; i < 5; i++) {
    const r1 = await makeRlRequest('POST', '/hit', ip);
    assert.strictEqual(r1.status, 200, `/hit request ${i + 1} should succeed`);
    const r2 = await makeRlRequest('POST', '/increment', ip);
    assert.strictEqual(r2.status, 200, `/increment request ${i + 1} should succeed`);
  }
  // 11th request (either endpoint) must be throttled
  const throttled = await makeRlRequest('POST', '/hit', ip);
  assert.strictEqual(throttled.status, 429);
});

test('rate limit: different IPs are tracked independently', async () => {
  const ip1 = '198.51.100.3';
  const ip2 = '198.51.100.4';
  for (let i = 0; i < 10; i++) {
    await makeRlRequest('POST', '/hit', ip1);
  }
  // ip1 is exhausted but ip2 should still be allowed
  const res = await makeRlRequest('POST', '/hit', ip2);
  assert.strictEqual(res.status, 200);
});

test('rate limit: 429 response carries required security headers', async () => {
  const ip = '198.51.100.5';
  for (let i = 0; i < 10; i++) {
    await makeRlRequest('POST', '/hit', ip);
  }
  const res = await makeRlRequest('POST', '/hit', ip);
  assert.strictEqual(res.status, 429);
  assert.ok(res.headers.get('Content-Security-Policy'), 'CSP header must be set on 429');
  assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(res.headers.get('X-Frame-Options'), 'DENY');
});

test('rate limit: GET /auth/discord/login is capped at 5 requests per minute', async () => {
  const ip = '198.51.100.6';
  for (let i = 0; i < 5; i++) {
    const res = await makeRlRequest('GET', '/auth/discord/login', ip);
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await makeRlRequest('GET', '/auth/discord/login', ip);
  assert.strictEqual(throttled.status, 429);
});

test('rate limit: GET /get allows 60 requests then returns 429', async () => {
  const ip = '198.51.100.7';
  for (let i = 0; i < 60; i++) {
    const res = await makeRlRequest('GET', '/get', ip);
    assert.strictEqual(res.status, 200, `request ${i + 1} should succeed`);
  }
  const throttled = await makeRlRequest('GET', '/get', ip);
  assert.strictEqual(throttled.status, 429);
});

// ─── /layout endpoint tests ───────────────────────────────────────────────────

function makeLayoutDbCapture() {
  const store = {};
  return {
    prepare(sql) {
      const sqlU = sql.trim().toUpperCase();
      return {
        bind(...args) {
          return {
            async all() {
              if (sqlU.startsWith('SELECT')) {
                const page = args[0];
                const rows = Object.entries(store)
                  .filter(([k]) => k.startsWith(page + ':'))
                  .map(([k, v]) => ({ element_id: k.slice(page.length + 1), ...v }));
                return { results: rows };
              }
              return { results: [] };
            },
            async first() { return null; },
            _args: args,
            _sql: sql,
          };
        },
      };
    },
    async batch(stmts) {
      for (const stmt of stmts) {
        if (stmt._sql && stmt._sql.includes('layout_overrides') && stmt._args) {
          const [page, elementId, top, left, width, height] = stmt._args;
          store[`${page}:${elementId}`] = { top_pct: top, left_pct: left, width_pct: width, height_pct: height };
        }
      }
    },
  };
}

test('contract: GET /layout returns 400 when page param is missing', async () => {
  const res = await worker.fetch(
    makeContractRequest('GET', '/layout'),
    makeContractEnv({ DB: makeLayoutDbCapture() }),
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

test('contract: GET /layout returns 400 for an invalid page param', async () => {
  const res = await worker.fetch(
    makeContractRequest('GET', '/layout?page=../../etc/passwd'),
    makeContractEnv({ DB: makeLayoutDbCapture() }),
  );
  assert.strictEqual(res.status, 400);
});

test('contract: GET /layout returns 200 with empty overrides for a valid page', async () => {
  const res = await worker.fetch(
    makeContractRequest('GET', '/layout?page=chapel'),
    makeContractEnv({ DB: makeLayoutDbCapture() }),
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.overrides !== undefined, 'body.overrides must be present');
  assert.strictEqual(typeof body.overrides, 'object');
});

test('contract: POST /layout returns 401 without an auth session', async () => {
  const req = new Request('http://localhost/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 'chapel', overrides: {} }),
  });
  const res = await worker.fetch(req, makeContractEnv({ DB: makeLayoutDbCapture() }));
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.strictEqual(body.error, 'Unauthorized');
});

test('contract: OPTIONS preflight on /layout returns 204', async () => {
  const res = await worker.fetch(
    makeContractRequest('OPTIONS', '/layout', { Origin: 'http://localhost' }),
    makeContractEnv({ DB: makeLayoutDbCapture() }),
  );
  assert.strictEqual(res.status, 204);
});

test('contract: DELETE /layout is rejected with 405', async () => {
  const res = await worker.fetch(
    makeContractRequest('DELETE', '/layout'),
    makeContractEnv({ DB: makeLayoutDbCapture() }),
  );
  assert.strictEqual(res.status, 405);
});

test('rate limit: GET /layout allows 60 requests then returns 429', async () => {
  const ip = '198.51.100.8';
  const db = makeLayoutDbCapture();
  for (let i = 0; i < 60; i++) {
    const res = await worker.fetch(
      new Request('http://localhost/layout?page=chapel', {
        method: 'GET',
        headers: { 'CF-Connecting-IP': ip },
      }),
      makeContractEnv({ DB: db, RATE_LIMIT_ENABLED: 'true' }),
    );
    assert.strictEqual(res.status, 200, `request ${i + 1} should succeed`);
  }
  const throttled = await worker.fetch(
    new Request('http://localhost/layout?page=chapel', {
      method: 'GET',
      headers: { 'CF-Connecting-IP': ip },
    }),
    makeContractEnv({ DB: db, RATE_LIMIT_ENABLED: 'true' }),
  );
  assert.strictEqual(throttled.status, 429);
});
