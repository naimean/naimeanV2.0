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

test('contract: unknown non-backend routes return 404 instead of serving static assets', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/'), makeContractEnv());
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.strictEqual(body.error, 'Not found');
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
      // The worker uses an INSERT ... ON CONFLICT ... RETURNING upsert to
      // atomically increment and read back the new value.
      const isIncrementUpsert = sql.trim().toUpperCase().startsWith('INSERT');
      return {
        bind(..._args) {
          return {
            async first() {
              return { value: isIncrementUpsert ? 42 : 41 };
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

test('contract: POST /increment creates and increments when counter seed row is missing', async () => {
  const mockDbMissingSeedRow = {
    prepare(sql) {
      const normalizedSql = sql.trim().toUpperCase();
      return {
        bind(..._args) {
          return {
            async first() {
              if (normalizedSql.startsWith('INSERT')) {
                return { value: 1 };
              }
              return { value: 0 };
            },
          };
        },
      };
    },
  };

  const res = await worker.fetch(
    makeContractRequest('POST', '/increment'),
    makeContractEnv({ DB: mockDbMissingSeedRow }),
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.value, 1);
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

function makeLayoutDbCapture(options = {}) {
  const {
    includeFontSizeColumn = true,
  } = options;
  const store = {};
  const executedSql = [];
  return {
    executedSql,
    prepare(sql) {
      const sqlU = sql.trim().toUpperCase();
      executedSql.push(sql.trim());
      if (sqlU.startsWith('CREATE TABLE') || sqlU.startsWith('ALTER TABLE')) {
        return {
          async run() {
            return { success: true };
          },
        };
      }
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
        async all() {
          if (sqlU.startsWith('PRAGMA TABLE_INFO')) {
            const results = [
              { name: 'page' },
              { name: 'element_id' },
              { name: 'top_pct' },
              { name: 'left_pct' },
              { name: 'width_pct' },
              { name: 'height_pct' },
            ];
            if (includeFontSizeColumn) {
              results.push({ name: 'font_size_pct' });
            }
            results.push({ name: 'updated_at' });
            return { results };
          }
          return { results: [] };
        },
      };
    },
    async batch(stmts) {
      for (const stmt of stmts) {
        if (stmt._sql && stmt._sql.includes('layout_overrides') && stmt._args) {
          if (stmt._args.length < 7) {
            continue;
          }
          const [page, elementId, top, left, width, height, fontSizePct] = stmt._args;
          store[`${page}:${elementId}`] = {
            top_pct: top,
            left_pct: left,
            width_pct: width,
            height_pct: height,
            font_size_pct: fontSizePct,
          };
        }
      }
    },
  };
}

function makeFailingLayoutInitDb() {
  return {
    prepare(sql) {
      const sqlU = sql.trim().toUpperCase();
      if (sqlU.startsWith('CREATE TABLE')) {
        return {
          async run() {
            throw new Error('db unavailable');
          },
        };
      }
      return {
        bind() {
          return {
            async all() { return { results: [] }; },
            async first() { return null; },
            _sql: sql,
            _args: [],
          };
        },
      };
    },
    async batch() {},
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
  const db = makeLayoutDbCapture();
  const res = await worker.fetch(
    makeContractRequest('GET', '/layout?page=chapel'),
    makeContractEnv({ DB: db }),
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.overrides !== undefined, 'body.overrides must be present');
  assert.strictEqual(typeof body.overrides, 'object');
  assert.ok(db.executedSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS layout_overrides')));
});

test('contract: GET /layout adds font_size_pct column when migration is needed', async () => {
  const db = makeLayoutDbCapture({ includeFontSizeColumn: false });
  const res = await worker.fetch(
    makeContractRequest('GET', '/layout?page=chapel'),
    makeContractEnv({ DB: db }),
  );
  assert.strictEqual(res.status, 200);
  assert.ok(db.executedSql.some((sql) => sql.includes('ALTER TABLE layout_overrides ADD COLUMN font_size_pct REAL')));
});

test('contract: GET /layout returns 500 when layout table initialization fails', async () => {
  const res = await worker.fetch(
    makeContractRequest('GET', '/layout?page=chapel'),
    makeContractEnv({ DB: makeFailingLayoutInitDb() }),
  );
  assert.strictEqual(res.status, 500);
  const body = await res.json();
  assert.strictEqual(body.error, 'Internal server error');
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

// Helper: mint a signed session cookie using the same algorithm as the worker.
const LAYOUT_AUTH_SESSION_SECRET = 'layout-test-session-secret-long-enough-for-hmac';
async function createTestSessionCookie(sub) {
  const payload = { sub, username: 'testuser', displayName: 'Test', avatar: '', exp: Date.now() + 3600_000 };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LAYOUT_AUTH_SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(encodedPayload));
  const encodedSig = Buffer.from(sig).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `naimean_session=${encodedPayload}.${encodedSig}`;
}

test('contract: POST /layout with matching OWNER_DISCORD_ID returns 200', async () => {
  const ownerId = 'discord_owner_123';
  const cookie = await createTestSessionCookie(ownerId);
  const req = new Request('http://localhost/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ page: 'chapel', overrides: {} }),
  });
  const env = makeContractEnv({
    DB: makeLayoutDbCapture(),
    SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET,
    OWNER_DISCORD_ID: ownerId,
  });
  const res = await worker.fetch(req, env);
  assert.strictEqual(res.status, 200);
});

test('contract: POST /layout with non-matching OWNER_DISCORD_ID returns 403', async () => {
  const cookie = await createTestSessionCookie('discord_other_user');
  const req = new Request('http://localhost/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ page: 'chapel', overrides: {} }),
  });
  const env = makeContractEnv({
    DB: makeLayoutDbCapture(),
    SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET,
    OWNER_DISCORD_ID: 'discord_owner_123',
  });
  const res = await worker.fetch(req, env);
  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.error, 'Forbidden');
});

test('contract: POST /layout with valid session and no OWNER_DISCORD_ID set returns 200', async () => {
  const cookie = await createTestSessionCookie('anyone');
  const db = makeLayoutDbCapture();
  const req = new Request('http://localhost/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ page: 'chapel', overrides: {} }),
  });
  const env = makeContractEnv({
    DB: db,
    SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET,
    // OWNER_DISCORD_ID intentionally omitted
  });
  const res = await worker.fetch(req, env);
  assert.strictEqual(res.status, 200);
  assert.ok(db.executedSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS layout_overrides')));
});

test('contract: POST /layout stores fontSizePct and GET /layout returns it', async () => {
  const cookie = await createTestSessionCookie('anyone');
  const db = makeLayoutDbCapture();
  const saveReq = new Request('http://localhost/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      page: 'chapel--vp-390',
      overrides: {
        'chapel-tv-counter': {
          top: 53.5,
          left: 44.2,
          width: 2.1,
          height: 1.8,
          fontSizePct: 1.25,
        },
      },
    }),
  });
  const env = makeContractEnv({
    DB: db,
    SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET,
  });

  const saveRes = await worker.fetch(saveReq, env);
  assert.strictEqual(saveRes.status, 200);

  const loadRes = await worker.fetch(
    makeContractRequest('GET', '/layout?page=chapel--vp-390'),
    makeContractEnv({ DB: db }),
  );
  assert.strictEqual(loadRes.status, 200);
  const body = await loadRes.json();
  assert.deepEqual(body.overrides['chapel-tv-counter'], {
    top: 53.5,
    left: 44.2,
    width: 2.1,
    height: 1.8,
    fontSizePct: 1.25,
  });
});

test('contract: POST /layout without fontSizePct returns null for that field on GET', async () => {
  const cookie = await createTestSessionCookie('anyone');
  const db = makeLayoutDbCapture();
  const saveReq = new Request('http://localhost/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      page: 'chapel--vp-768',
      overrides: {
        'chapel-return-btn': {
          top: 50,
          left: 40,
          width: 10,
          height: 5,
        },
      },
    }),
  });
  const env = makeContractEnv({
    DB: db,
    SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET,
  });

  const saveRes = await worker.fetch(saveReq, env);
  assert.strictEqual(saveRes.status, 200);

  const loadRes = await worker.fetch(
    makeContractRequest('GET', '/layout?page=chapel--vp-768'),
    makeContractEnv({ DB: db }),
  );
  assert.strictEqual(loadRes.status, 200);
  const body = await loadRes.json();
  assert.deepEqual(body.overrides['chapel-return-btn'], {
    top: 50,
    left: 40,
    width: 10,
    height: 5,
    fontSizePct: null,
  });
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


// ─── Email auth mock DB helper ────────────────────────────────────────────────
// Supports SELECT (first()) and INSERT (run()) on registered_users,
// and falls back to the rickroll counter mock for other queries.

function makeEmailAuthMockDb(existingUsers = []) {
  const store = new Map(existingUsers.map((u) => [u.email, u]));
  return {
    prepare(sql) {
      const normalized = sql.trim().toUpperCase();
      const isRegisteredUsersSelect = normalized.startsWith('SELECT') && sql.includes('registered_users');
      const isRegisteredUsersInsert = normalized.startsWith('INSERT') && sql.includes('registered_users');
      return {
        bind(...args) {
          return {
            async first() {
              if (isRegisteredUsersSelect) {
                return store.get(args[0]) || null;
              }
              return { value: 0 };
            },
            async run() {
              if (isRegisteredUsersInsert) {
                const [id, email, username, passwordHash, createdAt] = args;
                store.set(email, { id, email, username, password_hash: passwordHash, created_at: createdAt });
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function makeEmailAuthRequest(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
  };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${path}`, options);
}

const EMAIL_AUTH_SESSION_SECRET = 'test-session-secret-long-enough-for-hmac';

// ─── POST /auth/register contract tests ──────────────────────────────────────

test('contract: POST /auth/register creates an account and sets a session cookie', async () => {
  const db = makeEmailAuthMockDb();
  const env = makeContractEnv({ DB: db, SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'alice@example.com',
      username: 'alice',
      password: 'password123',
    }),
    env,
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.username, 'alice');
  const setCookie = res.headers.get('Set-Cookie') || '';
  assert.ok(setCookie.includes('naimean_session='), 'Session cookie must be set on register');
});

test('contract: POST /auth/register returns 409 for a duplicate email', async () => {
  const db = makeEmailAuthMockDb([{
    id: 'existing-id',
    email: 'taken@example.com',
    username: 'taken',
    password_hash: 'fakehash',
    created_at: Date.now(),
  }]);
  const env = makeContractEnv({ DB: db, SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'taken@example.com',
      username: 'newuser',
      password: 'password123',
    }),
    env,
  );
  assert.strictEqual(res.status, 409);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

test('contract: POST /auth/register returns 400 for an invalid email', async () => {
  const env = makeContractEnv({ SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'not-an-email',
      username: 'user',
      password: 'password123',
    }),
    env,
  );
  assert.strictEqual(res.status, 400);
});

test('contract: POST /auth/register returns 400 for an invalid username', async () => {
  const env = makeContractEnv({ SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'user@example.com',
      username: '',
      password: 'password123',
    }),
    env,
  );
  assert.strictEqual(res.status, 400);
});

test('contract: POST /auth/register returns 400 for a username that is too long', async () => {
  const env = makeContractEnv({ SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'user@example.com',
      username: 'this-username-is-way-too-long-for-the-limit',
      password: 'password123',
    }),
    env,
  );
  assert.strictEqual(res.status, 400);
});

test('contract: POST /auth/register returns 400 when password is too short', async () => {
  const env = makeContractEnv({ SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'user@example.com',
      username: 'user',
      password: 'short',
    }),
    env,
  );
  assert.strictEqual(res.status, 400);
});

// ─── POST /auth/emaillogin contract tests ─────────────────────────────────────

test('contract: POST /auth/emaillogin returns 200 with correct credentials', async () => {
  // Use a shared DB so the registered user persists for the login call.
  const db = makeEmailAuthMockDb();
  const env = makeContractEnv({ DB: db, SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });

  // Register first so a real password hash is stored.
  await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'bob@example.com',
      username: 'bob',
      password: 'correct-horse',
    }),
    env,
  );

  const loginRes = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/emaillogin', {
      email: 'bob@example.com',
      password: 'correct-horse',
    }),
    env,
  );
  assert.strictEqual(loginRes.status, 200);
  const body = await loginRes.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.username, 'bob');
  const setCookie = loginRes.headers.get('Set-Cookie') || '';
  assert.ok(setCookie.includes('naimean_session='), 'Session cookie must be set on login');
});

test('contract: POST /auth/emaillogin returns 401 for a wrong password', async () => {
  const db = makeEmailAuthMockDb();
  const env = makeContractEnv({ DB: db, SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });

  await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'carol@example.com',
      username: 'carol',
      password: 'correct-password',
    }),
    env,
  );

  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/emaillogin', {
      email: 'carol@example.com',
      password: 'wrong-password',
    }),
    env,
  );
  assert.strictEqual(res.status, 401);
});

test('contract: POST /auth/emaillogin returns 401 for an unknown email', async () => {
  const env = makeContractEnv({
    DB: makeEmailAuthMockDb(),
    SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET,
  });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/emaillogin', {
      email: 'nobody@example.com',
      password: 'somepassword',
    }),
    env,
  );
  assert.strictEqual(res.status, 401);
});

test('contract: POST /auth/emaillogin returns 400 when body is missing required fields', async () => {
  const env = makeContractEnv({ SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/emaillogin', { email: '' }),
    env,
  );
  assert.strictEqual(res.status, 400);
});

// ─── Session provider field ───────────────────────────────────────────────────

test('contract: GET /auth/session returns provider=email for an email-registered user', async () => {
  const db = makeEmailAuthMockDb();
  const env = makeContractEnv({ DB: db, SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET });

  const regRes = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'dave@example.com',
      username: 'dave',
      password: 'password123',
    }),
    env,
  );
  const setCookie = regRes.headers.get('Set-Cookie') || '';
  const match = setCookie.match(/naimean_session=([^;]+)/);
  assert.ok(match, 'Session cookie must be present after register');

  const sessionRes = await worker.fetch(
    new Request('http://localhost/auth/session', {
      method: 'GET',
      headers: { Cookie: `naimean_session=${match[1]}` },
    }),
    env,
  );
  assert.strictEqual(sessionRes.status, 200);
  const body = await sessionRes.json();
  assert.strictEqual(body.authenticated, true);
  assert.strictEqual(body.user.username, 'dave');
  assert.strictEqual(body.user.provider, 'email');
});

test('contract: POST /auth/register requires POST method (GET returns 405)', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/auth/register'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

test('contract: POST /auth/emaillogin requires POST method (GET returns 405)', async () => {
  const res = await worker.fetch(makeContractRequest('GET', '/auth/emaillogin'), makeContractEnv());
  assert.strictEqual(res.status, 405);
});

// ─── Email auth rate limit tests ──────────────────────────────────────────────

test('rate limit: POST /auth/register is capped at 3 requests per minute', async () => {
  const ip = '198.51.100.20';
  for (let i = 0; i < 3; i++) {
    const res = await makeRlRequest('POST', '/auth/register', ip);
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await makeRlRequest('POST', '/auth/register', ip);
  assert.strictEqual(throttled.status, 429);
});

test('rate limit: POST /auth/emaillogin is capped at 5 requests per minute', async () => {
  const ip = '198.51.100.21';
  for (let i = 0; i < 5; i++) {
    const res = await makeRlRequest('POST', '/auth/emaillogin', ip);
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await makeRlRequest('POST', '/auth/emaillogin', ip);
  assert.strictEqual(throttled.status, 429);
});

// ─── Additional pure helper tests ────────────────────────────────────────────
// These functions are already inlined at the top of this file; the tests below
// cover branches that the earlier test suite did not exercise.

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,16}$/.test(username.trim());
}

function isValidLayoutPage(page) {
  if (typeof page !== 'string' || !page || page.length > 64) return false;
  return /^[a-zA-Z0-9_\-]+$/.test(page);
}

function isValidElementId(id) {
  if (typeof id !== 'string' || !id || id.length > 64) return false;
  return /^[a-zA-Z0-9_\-.]+$/.test(id);
}

function parseLayoutNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildRelativeUrlWithParam(returnTo, key, value) {
  const url = new URL(returnTo, 'https://naimean.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

// ── isEnabledEnvFlag ──────────────────────────────────────────────────────────

test('isEnabledEnvFlag – boolean true returns true', () => {
  assert.strictEqual(isEnabledEnvFlag(true), true);
});

test('isEnabledEnvFlag – boolean false returns false', () => {
  assert.strictEqual(isEnabledEnvFlag(false), false);
});

test('isEnabledEnvFlag – truthy string values return true', () => {
  assert.strictEqual(isEnabledEnvFlag('true'), true);
  assert.strictEqual(isEnabledEnvFlag('1'), true);
  assert.strictEqual(isEnabledEnvFlag('yes'), true);
  assert.strictEqual(isEnabledEnvFlag('on'), true);
  assert.strictEqual(isEnabledEnvFlag('TRUE'), true);
  assert.strictEqual(isEnabledEnvFlag('  Yes  '), true);
});

test('isEnabledEnvFlag – falsy string values return false', () => {
  assert.strictEqual(isEnabledEnvFlag('false'), false);
  assert.strictEqual(isEnabledEnvFlag('0'), false);
  assert.strictEqual(isEnabledEnvFlag('off'), false);
  assert.strictEqual(isEnabledEnvFlag(''), false);
  assert.strictEqual(isEnabledEnvFlag('no'), false);
});

test('isEnabledEnvFlag – non-string non-boolean values return false', () => {
  assert.strictEqual(isEnabledEnvFlag(null), false);
  assert.strictEqual(isEnabledEnvFlag(undefined), false);
  assert.strictEqual(isEnabledEnvFlag(1), false);
  assert.strictEqual(isEnabledEnvFlag(0), false);
});

// ── isNonProductionEnvironment ────────────────────────────────────────────────

test('isNonProductionEnvironment – production/prod values return false', () => {
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: 'production' }), false);
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: 'prod' }), false);
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: '  PRODUCTION  ' }), false);
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: 'PROD' }), false);
});

test('isNonProductionEnvironment – non-production values return true', () => {
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: 'development' }), true);
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: 'staging' }), true);
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: 'test' }), true);
});

test('isNonProductionEnvironment – empty or absent APP_ENV returns false', () => {
  assert.strictEqual(isNonProductionEnvironment({}), false);
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: '' }), false);
});

test('isNonProductionEnvironment – falls back to ENVIRONMENT when APP_ENV is not a string', () => {
  assert.strictEqual(isNonProductionEnvironment({ ENVIRONMENT: 'production' }), false);
  assert.strictEqual(isNonProductionEnvironment({ ENVIRONMENT: 'staging' }), true);
  // APP_ENV=0 is not a string, so ENVIRONMENT is consulted
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: 0, ENVIRONMENT: 'staging' }), true);
});

test('isNonProductionEnvironment – empty-string APP_ENV takes precedence, ignoring ENVIRONMENT', () => {
  // APP_ENV is a string (even though empty), so ENVIRONMENT is never consulted.
  assert.strictEqual(isNonProductionEnvironment({ APP_ENV: '', ENVIRONMENT: 'staging' }), false);
});

// ── parseAllowedOriginList ────────────────────────────────────────────────────

test('parseAllowedOriginList – empty or null value returns empty array', () => {
  assert.deepEqual(parseAllowedOriginList(''), []);
  assert.deepEqual(parseAllowedOriginList(null), []);
  assert.deepEqual(parseAllowedOriginList(undefined), []);
});

test('parseAllowedOriginList – valid https and http origins are normalized and returned', () => {
  const result = parseAllowedOriginList('https://naimean.com, http://localhost');
  assert.deepEqual(result, ['https://naimean.com', 'http://localhost']);
});

test('parseAllowedOriginList – invalid entries and non-http(s) protocols are silently ignored', () => {
  const result = parseAllowedOriginList('not-a-url, ftp://files.example.com, https://valid.com');
  assert.deepEqual(result, ['https://valid.com']);
});

test('parseAllowedOriginList – origin hostname is normalised to lowercase', () => {
  const result = parseAllowedOriginList('https://NAIMEAN.COM');
  assert.deepEqual(result, ['https://naimean.com']);
});

// ── isValidEmail ──────────────────────────────────────────────────────────────

test('isValidEmail – valid email addresses return true', () => {
  assert.ok(isValidEmail('user@example.com'));
  assert.ok(isValidEmail('user+tag@sub.domain.org'));
  assert.ok(isValidEmail('  user@example.com  ')); // trimmed
});

test('isValidEmail – invalid email addresses return false', () => {
  assert.strictEqual(isValidEmail(''), false);
  assert.strictEqual(isValidEmail(null), false);
  assert.strictEqual(isValidEmail('not-an-email'), false);
  assert.strictEqual(isValidEmail('user@'), false);
  assert.strictEqual(isValidEmail('@domain.com'), false);
  assert.strictEqual(isValidEmail('a b@c.com'), false); // space in local
});

test('isValidEmail – email exceeding 254 characters returns false', () => {
  const longEmail = 'a'.repeat(250) + '@b.com';
  assert.strictEqual(isValidEmail(longEmail), false);
});

// ── isValidUsername ───────────────────────────────────────────────────────────

test('isValidUsername – valid usernames return true', () => {
  assert.ok(isValidUsername('alice'));
  assert.ok(isValidUsername('bob_123'));
  assert.ok(isValidUsername('user-name'));
  assert.ok(isValidUsername('a')); // 1 character minimum
  assert.ok(isValidUsername('1234567890123456')); // 16 characters maximum
});

test('isValidUsername – invalid usernames return false', () => {
  assert.strictEqual(isValidUsername(''), false);
  assert.strictEqual(isValidUsername(null), false);
  assert.strictEqual(isValidUsername('this-username-is-17chars!'), false); // too long
  assert.strictEqual(isValidUsername('user name'), false); // space
  assert.strictEqual(isValidUsername('user@name'), false); // @ symbol
});

// ── isValidLayoutPage ─────────────────────────────────────────────────────────

test('isValidLayoutPage – valid page names return true', () => {
  assert.ok(isValidLayoutPage('chapel'));
  assert.ok(isValidLayoutPage('chapel--vp-390'));
  assert.ok(isValidLayoutPage('page_1'));
  assert.ok(isValidLayoutPage('MyPage'));
});

test('isValidLayoutPage – invalid page names return false', () => {
  assert.strictEqual(isValidLayoutPage(''), false);
  assert.strictEqual(isValidLayoutPage(null), false);
  assert.strictEqual(isValidLayoutPage('../../etc/passwd'), false);
  assert.strictEqual(isValidLayoutPage('page with spaces'), false);
  assert.strictEqual(isValidLayoutPage('page.sub'), false); // dot not allowed
  assert.strictEqual(isValidLayoutPage('a'.repeat(65)), false); // exceeds max length
});

// ── isValidElementId ──────────────────────────────────────────────────────────

test('isValidElementId – valid element IDs return true', () => {
  assert.ok(isValidElementId('chapel-tv-counter'));
  assert.ok(isValidElementId('button.primary'));
  assert.ok(isValidElementId('element_1'));
  assert.ok(isValidElementId('a')); // single character
});

test('isValidElementId – invalid element IDs return false', () => {
  assert.strictEqual(isValidElementId(''), false);
  assert.strictEqual(isValidElementId(null), false);
  assert.strictEqual(isValidElementId('../evil'), false); // path traversal
  assert.strictEqual(isValidElementId('element id'), false); // space
  assert.strictEqual(isValidElementId('a'.repeat(65)), false); // exceeds max length
});

// ── parseLayoutNumber ─────────────────────────────────────────────────────────

test('parseLayoutNumber – finite numbers are returned as-is', () => {
  assert.strictEqual(parseLayoutNumber(42), 42);
  assert.strictEqual(parseLayoutNumber(0), 0);
  assert.strictEqual(parseLayoutNumber(-5.5), -5.5);
  assert.strictEqual(parseLayoutNumber('3.14'), 3.14);
  assert.strictEqual(parseLayoutNumber('0'), 0);
});

test('parseLayoutNumber – non-finite values return null', () => {
  assert.strictEqual(parseLayoutNumber(NaN), null);
  assert.strictEqual(parseLayoutNumber(Infinity), null);
  assert.strictEqual(parseLayoutNumber(-Infinity), null);
  assert.strictEqual(parseLayoutNumber('abc'), null);
  assert.strictEqual(parseLayoutNumber(undefined), null);
});

// ── buildRelativeUrlWithParam ─────────────────────────────────────────────────

test('buildRelativeUrlWithParam – appends a query param to a plain path', () => {
  assert.strictEqual(buildRelativeUrlWithParam('/page', 'auth', 'success'), '/page?auth=success');
});

test('buildRelativeUrlWithParam – merges with an existing query string', () => {
  const result = buildRelativeUrlWithParam('/page?existing=1', 'auth', 'value');
  assert.ok(result.includes('existing=1'));
  assert.ok(result.includes('auth=value'));
});

test('buildRelativeUrlWithParam – works for root path', () => {
  assert.strictEqual(buildRelativeUrlWithParam('/', 'auth', 'failed'), '/?auth=failed');
});

// ─── Additional contract tests ────────────────────────────────────────────────

// ── CORS: disallowed origins are rejected on mutating endpoints ───────────────

test('contract: POST /auth/logout from a disallowed origin returns 403', async () => {
  const res = await worker.fetch(
    new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://attacker.com' },
    }),
    makeContractEnv(),
  );
  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.error, 'Forbidden');
});

test('contract: POST /auth/register from a disallowed origin returns 403', async () => {
  const res = await worker.fetch(
    new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.com' },
      body: JSON.stringify({ email: 'user@example.com', username: 'user', password: 'password123' }),
    }),
    makeContractEnv({ SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.error, 'Forbidden');
});

test('contract: POST /auth/emaillogin from a disallowed origin returns 403', async () => {
  const res = await worker.fetch(
    new Request('http://localhost/auth/emaillogin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.com' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    }),
    makeContractEnv({ SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 403);
  const body = await res.json();
  assert.strictEqual(body.error, 'Forbidden');
});

// ── Session validation edge cases ─────────────────────────────────────────────

test('contract: GET /auth/session with an expired session cookie returns authenticated: false', async () => {
  const secret = LAYOUT_AUTH_SESSION_SECRET;
  const payload = { sub: 'user123', username: 'testuser', exp: Date.now() - 1000 };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(encodedPayload));
  const encodedSig = Buffer.from(sig).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const expiredCookie = `naimean_session=${encodedPayload}.${encodedSig}`;

  const res = await worker.fetch(
    new Request('http://localhost/auth/session', {
      method: 'GET',
      headers: { Cookie: expiredCookie },
    }),
    makeContractEnv({ SESSION_SECRET: secret }),
  );
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.authenticated, false);
});

// ── 503 when SESSION_SECRET is not configured ─────────────────────────────────

test('contract: POST /auth/register returns 503 when SESSION_SECRET is not configured', async () => {
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/register', {
      email: 'user@example.com',
      username: 'user',
      password: 'password123',
    }),
    makeContractEnv(), // no SESSION_SECRET
  );
  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

test('contract: POST /auth/emaillogin returns 503 when SESSION_SECRET is not configured', async () => {
  const res = await worker.fetch(
    makeEmailAuthRequest('POST', '/auth/emaillogin', {
      email: 'user@example.com',
      password: 'password123',
    }),
    makeContractEnv(), // no SESSION_SECRET
  );
  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

// ── /go redirect tests with a valid session ───────────────────────────────────

test('contract: GET /go/whiteboard with a valid session returns 303 redirect to an HTTPS URL', async () => {
  const cookie = await createTestSessionCookie('user123');
  const res = await worker.fetch(
    new Request('http://localhost/go/whiteboard', {
      method: 'GET',
      headers: { Cookie: cookie },
    }),
    makeContractEnv({ SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 303);
  const location = res.headers.get('Location') || '';
  assert.ok(location.startsWith('https://'), `Location must be an HTTPS URL, got: ${location}`);
});

test('contract: GET /go/capex with a valid session returns 303 redirect', async () => {
  const cookie = await createTestSessionCookie('user123');
  const res = await worker.fetch(
    new Request('http://localhost/go/capex', {
      method: 'GET',
      headers: { Cookie: cookie },
    }),
    makeContractEnv({ SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 303);
});

test('contract: GET /go/:tool uses a custom TOOL_URL env var when set', async () => {
  const cookie = await createTestSessionCookie('user123');
  const customUrl = 'https://custom.whiteboard.example.com/';
  const res = await worker.fetch(
    new Request('http://localhost/go/whiteboard', {
      method: 'GET',
      headers: { Cookie: cookie },
    }),
    makeContractEnv({
      SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET,
      TOOL_URL_WHITEBOARD: customUrl,
    }),
  );
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('Location'), customUrl);
});

test('contract: GET /go with a valid session but an unknown tool name returns 404', async () => {
  const cookie = await createTestSessionCookie('user123');
  const res = await worker.fetch(
    new Request('http://localhost/go/nonexistent-tool', {
      method: 'GET',
      headers: { Cookie: cookie },
    }),
    makeContractEnv({ SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

// ── /layout POST input validation tests ──────────────────────────────────────

test('contract: POST /layout with invalid JSON body returns 400', async () => {
  const cookie = await createTestSessionCookie('user123');
  const res = await worker.fetch(
    new Request('http://localhost/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: '{not valid json}',
    }),
    makeContractEnv({ DB: makeLayoutDbCapture(), SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(typeof body.error === 'string');
});

test('contract: POST /layout with an array for overrides returns 400', async () => {
  const cookie = await createTestSessionCookie('user123');
  const res = await worker.fetch(
    new Request('http://localhost/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ page: 'chapel', overrides: [{ top: 1 }] }),
    }),
    makeContractEnv({ DB: makeLayoutDbCapture(), SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 400);
});

test('contract: POST /layout with more than 20 overrides returns 400', async () => {
  const cookie = await createTestSessionCookie('user123');
  const overrides = {};
  for (let i = 0; i < 21; i++) {
    overrides[`element-${i}`] = { top: 10, left: 10, width: 10, height: 10 };
  }
  const res = await worker.fetch(
    new Request('http://localhost/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ page: 'chapel', overrides }),
    }),
    makeContractEnv({ DB: makeLayoutDbCapture(), SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.error, 'Too many overrides');
});

test('contract: POST /layout with an invalid element ID returns 400', async () => {
  const cookie = await createTestSessionCookie('user123');
  const res = await worker.fetch(
    new Request('http://localhost/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        page: 'chapel',
        overrides: { '../evil/path': { top: 10, left: 10, width: 10, height: 10 } },
      }),
    }),
    makeContractEnv({ DB: makeLayoutDbCapture(), SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error.includes('Invalid element id'), `Unexpected error: ${body.error}`);
});

test('contract: POST /layout with a numeric value out of range returns 400', async () => {
  const cookie = await createTestSessionCookie('user123');
  const res = await worker.fetch(
    new Request('http://localhost/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        page: 'chapel',
        overrides: { 'valid-element': { top: 999, left: 10, width: 10, height: 10 } },
      }),
    }),
    makeContractEnv({ DB: makeLayoutDbCapture(), SESSION_SECRET: LAYOUT_AUTH_SESSION_SECRET }),
  );
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(body.error.includes('Value out of range'), `Unexpected error: ${body.error}`);
});

// ── Discord OAuth callback failure paths ──────────────────────────────────────

const DISCORD_OAUTH_ENV = makeContractEnv({
  DISCORD_CLIENT_ID: 'test-client-id',
  DISCORD_CLIENT_SECRET: 'test-client-secret',
  DISCORD_REDIRECT_URI: 'https://naimean.com/auth/discord/callback',
  SESSION_SECRET: EMAIL_AUTH_SESSION_SECRET,
});

// Helper: mint a signed OAuth state cookie using the same algorithm as the worker.
async function createTestOAuthCookie(secret, overrides = {}) {
  const payload = {
    state: 'valid-state-token',
    codeVerifier: 'test-code-verifier',
    returnTo: '/',
    exp: Date.now() + 600_000,
    ...overrides,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(encodedPayload));
  const encodedSig = Buffer.from(sig).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `naimean_discord_oauth=${encodedPayload}.${encodedSig}`;
}

test('contract: GET /auth/discord/callback when OAuth is unconfigured redirects with auth=not_configured', async () => {
  const res = await worker.fetch(
    makeContractRequest('GET', '/auth/discord/callback?code=abc&state=xyz'),
    makeContractEnv(), // no DISCORD_* vars
  );
  assert.strictEqual(res.status, 302);
  const location = res.headers.get('Location') || '';
  assert.ok(location.includes('auth=not_configured'), `Expected auth=not_configured in ${location}`);
});

test('contract: GET /auth/discord/callback with no OAuth cookie redirects with auth=missing', async () => {
  const res = await worker.fetch(
    makeContractRequest('GET', '/auth/discord/callback?code=some-code&state=some-state'),
    DISCORD_OAUTH_ENV,
  );
  assert.strictEqual(res.status, 302);
  const location = res.headers.get('Location') || '';
  assert.ok(location.includes('auth=missing'), `Expected auth=missing in ${location}`);
});

test('contract: GET /auth/discord/callback with an expired OAuth cookie redirects with auth=expired', async () => {
  const expiredCookie = await createTestOAuthCookie(EMAIL_AUTH_SESSION_SECRET, {
    exp: Date.now() - 1000, // already expired
  });
  const res = await worker.fetch(
    new Request('http://localhost/auth/discord/callback?code=some-code&state=valid-state-token', {
      method: 'GET',
      headers: { Cookie: expiredCookie },
    }),
    DISCORD_OAUTH_ENV,
  );
  assert.strictEqual(res.status, 302);
  const location = res.headers.get('Location') || '';
  assert.ok(location.includes('auth=expired'), `Expected auth=expired in ${location}`);
});

test('contract: GET /auth/discord/callback with a state mismatch redirects with auth=state', async () => {
  const oauthCookie = await createTestOAuthCookie(EMAIL_AUTH_SESSION_SECRET, {
    state: 'valid-state-token',
  });
  const res = await worker.fetch(
    new Request('http://localhost/auth/discord/callback?code=some-code&state=wrong-state', {
      method: 'GET',
      headers: { Cookie: oauthCookie },
    }),
    DISCORD_OAUTH_ENV,
  );
  assert.strictEqual(res.status, 302);
  const location = res.headers.get('Location') || '';
  assert.ok(location.includes('auth=state'), `Expected auth=state in ${location}`);
});

// ─── Additional rate-limit tests ──────────────────────────────────────────────

test('rate limit: GET /auth/session is capped at 30 requests per minute', async () => {
  const ip = '198.51.100.30';
  for (let i = 0; i < 30; i++) {
    const res = await makeRlRequest('GET', '/auth/session', ip);
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await makeRlRequest('GET', '/auth/session', ip);
  assert.strictEqual(throttled.status, 429);
});

test('rate limit: POST /auth/logout is capped at 10 requests per minute', async () => {
  const ip = '198.51.100.31';
  for (let i = 0; i < 10; i++) {
    const res = await makeRlRequest('POST', '/auth/logout', ip);
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await makeRlRequest('POST', '/auth/logout', ip);
  assert.strictEqual(throttled.status, 429);
});

test('rate limit: GET /go/* is capped at 30 requests per minute', async () => {
  const ip = '198.51.100.32';
  for (let i = 0; i < 30; i++) {
    const res = await makeRlRequest('GET', '/go/whiteboard', ip);
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await makeRlRequest('GET', '/go/whiteboard', ip);
  assert.strictEqual(throttled.status, 429);
});

test('rate limit: POST /layout is capped at 10 requests per minute', async () => {
  const ip = '198.51.100.33';
  for (let i = 0; i < 10; i++) {
    const res = await worker.fetch(
      new Request('http://localhost/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ page: 'chapel', overrides: {} }),
      }),
      makeContractEnv({ RATE_LIMIT_ENABLED: 'true' }),
    );
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await worker.fetch(
    new Request('http://localhost/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ page: 'chapel', overrides: {} }),
    }),
    makeContractEnv({ RATE_LIMIT_ENABLED: 'true' }),
  );
  assert.strictEqual(throttled.status, 429);
});

test('rate limit: GET /auth/discord/callback is capped at 5 requests per minute', async () => {
  const ip = '198.51.100.34';
  for (let i = 0; i < 5; i++) {
    const res = await makeRlRequest('GET', '/auth/discord/callback', ip);
    assert.notStrictEqual(res.status, 429, `request ${i + 1} must not be throttled`);
  }
  const throttled = await makeRlRequest('GET', '/auth/discord/callback', ip);
  assert.strictEqual(throttled.status, 429);
});
