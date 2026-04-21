/**
 * barrelroll-counter-worker
 *
 * Cloudflare Worker that tracks the rickroll/barrel-roll counter using D1
 * and provides starter Discord OAuth session routes.
 *
 * Bindings required (set in wrangler.toml or the Cloudflare dashboard):
 *   DB  →  barrelroll-counter-db  (D1 database)
 *
 * Endpoints:
 *   GET  /get  – return the current counter value
 *   POST /hit  – increment the counter by 1, return the new value
 *   POST /increment  – alias of /hit for backward compatibility
 *   GET  /auth/session
 *   GET  /auth/discord/login
 *   GET  /auth/discord/callback
 *   POST /auth/logout
 *
 * Counter endpoints return JSON: { "value": <integer> }
 */

const COUNTER_ID = 'rickrolls';
const SESSION_COOKIE_NAME = 'naimean_session';
const OAUTH_COOKIE_NAME = 'naimean_discord_oauth';
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const OAUTH_FLOW_TTL_SECONDS = 60 * 10; // 10 minutes
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
const textEncoder = new TextEncoder();
const DEFAULT_ALLOWED_ORIGINS = [
  'https://naimean.com',
  'https://www.naimean.com',
  'https://naimean.github.io',
];
const DEFAULT_DEV_ALLOWED_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
];
const TRUE_LIKE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

// ─── Rate limiting ─────────────────────────────────────────────────────────────
// Sliding-window counters are kept in an in-memory Map for the lifetime of the
// worker isolate.  Cloudflare recycles isolates periodically, so this gives
// best-effort, per-isolate rate limiting without requiring Durable Objects.
// Set the RATE_LIMIT_ENABLED env variable to 'false' to disable (e.g. in tests).

const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute sliding window

// Maximum requests per IP per window for each route key.
// Write and auth routes are tighter; read routes are more lenient.
const RATE_LIMITS = {
  get: 60,            // GET /get           – read-only counter
  hit: 10,            // POST /hit, /increment – state-changing writes
  auth_session: 30,   // GET  /auth/session  – session validation
  auth_login: 5,      // GET  /auth/discord/login   – OAuth flow start
  auth_callback: 5,   // GET  /auth/discord/callback – code exchange
  auth_logout: 10,    // POST /auth/logout   – session teardown
  go: 30,             // GET  /go/*          – authenticated redirects
};

// Key format: `${ip}:${routeKey}` → { count, windowStart }
const rateLimitStore = new Map();

function normalizeOriginUrl(url) {
  return `${url.protocol}//${url.host}`.toLowerCase();
}

function isValidHostnameSuffix(value) {
  if (!value || value.startsWith('.') || value.endsWith('.')) {
    return false;
  }

  const labels = value.split('.');
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

function isNonProductionEnvironment(env) {
  const rawValue = typeof env.APP_ENV === 'string'
    ? env.APP_ENV
    : (typeof env.ENVIRONMENT === 'string' ? env.ENVIRONMENT : '');
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized !== 'production' && normalized !== 'prod';
}

function isEnabledEnvFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return false;
  }
  return TRUE_LIKE_ENV_VALUES.has(value.trim().toLowerCase());
}

function parseAllowedOriginList(value, env) {
  if (!value || typeof value !== 'string') {
    return [];
  }

  const items = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const normalizedOrigins = [];
  for (const item of items) {
    try {
      const url = new URL(item);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        continue;
      }
      normalizedOrigins.push(normalizeOriginUrl(url));
    } catch (error) {
      if (isNonProductionEnvironment(env)) {
        console.warn('Ignoring invalid CORS_ALLOWED_ORIGINS entry:', item, error);
      }
    }
  }
  return normalizedOrigins;
}

function parseAllowedHostnameSuffixes(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }
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

function getAllowedOriginsSet(env) {
  const configured = parseAllowedOriginList(env.CORS_ALLOWED_ORIGINS, env);
  const baseOrigins = configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;

  if (isNonProductionEnvironment(env)) {
    return new Set([...baseOrigins, ...DEFAULT_DEV_ALLOWED_ORIGINS]);
  }
  return new Set(baseOrigins);
}

function corsHeaders(origin, env) {
  if (!isAllowedOrigin(origin, env)) {
    // Origin not in allowlist – omit ACAO so browsers block the request.
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function isAllowedOrigin(origin, env) {
  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }

    const normalizedOrigin = normalizeOriginUrl(url);
    const allowedOrigins = getAllowedOriginsSet(env);
    if (allowedOrigins.has(normalizedOrigin)) {
      return true;
    }

    const hostname = url.hostname.toLowerCase();
    const allowedSuffixes = getAllowedHostnameSuffixes(env);
    if (allowedSuffixes.length === 0) {
      return false;
    }
    return allowedSuffixes.some((suffix) => hostname.endsWith(`.${suffix}`));
  } catch (error) {
    if (isNonProductionEnvironment(env)) {
      console.warn('Invalid Origin header for CORS evaluation:', origin, error);
    }
    return false;
  }
}

function jsonResponse(data, status, origin, env, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...corsHeaders(origin, env),
      ...extraHeaders,
    },
  });
}

function applyApiSecurityHeaders(response, isSecureTransport) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', API_CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()');

  if (isSecureTransport) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Returns the best-available client IP from Cloudflare or proxy headers.
function getClientIp(request) {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) {
    return cfIp.trim();
  }
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

// Checks whether a request from `ip` for `routeKey` is within `limit`.
// Increments the counter on allowed requests and returns a result object.
function checkRateLimit(ip, routeKey, limit) {
  const key = `${ip}:${routeKey}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS };
}

// Rate limiting is enabled by default; set RATE_LIMIT_ENABLED='false' to opt out.
function isRateLimitEnabled(env) {
  if (env.RATE_LIMIT_ENABLED === undefined || env.RATE_LIMIT_ENABLED === null) {
    return true;
  }
  return isEnabledEnvFlag(env.RATE_LIMIT_ENABLED);
}

function rateLimitedResponse(resetAt, origin, env) {
  const retryAfterSecs = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return jsonResponse({ error: 'Too many requests' }, 429, origin, env, {
    'Retry-After': String(retryAfterSecs),
  });
}

function parseCookies(headerValue) {
  if (!headerValue) {
    return {};
  }

  const result = {};
  for (const entry of headerValue.split(';')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function shouldUseSecureCookie(requestUrl) {
  return requestUrl.protocol === 'https:';
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${value}`];
  segments.push(`Path=${options.path || '/'}`);
  if (typeof options.maxAge === 'number') {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.httpOnly !== false) {
    segments.push('HttpOnly');
  }
  segments.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) {
    segments.push('Secure');
  }
  return segments.join('; ');
}

function createRedirectResponse(location, setCookies = []) {
  const response = new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      ...securityHeaders(),
    },
  });

  for (const cookie of setCookies) {
    response.headers.append('Set-Cookie', cookie);
  }

  return response;
}

function encodeBase64UrlFromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = normalized + '==='.slice((normalized.length + 3) % 4);
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64UrlFromString(value) {
  return encodeBase64UrlFromBytes(textEncoder.encode(value));
}

function decodeBase64UrlToString(value) {
  const bytes = decodeBase64UrlToBytes(value);
  return new TextDecoder().decode(bytes);
}

function randomBase64Url(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return encodeBase64UrlFromBytes(bytes);
}

async function sha256Base64Url(value) {
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return encodeBase64UrlFromBytes(new Uint8Array(hash));
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signValue(value, secret) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));
  return encodeBase64UrlFromBytes(new Uint8Array(signature));
}

async function verifyValueSignature(value, signature, secret) {
  const key = await importHmacKey(secret);
  const signatureBytes = decodeBase64UrlToBytes(signature);
  return crypto.subtle.verify('HMAC', key, signatureBytes, textEncoder.encode(value));
}

async function createSignedToken(payloadObject, secret) {
  const payload = encodeBase64UrlFromString(JSON.stringify(payloadObject));
  const signature = await signValue(payload, secret);
  return `${payload}.${signature}`;
}

async function readSignedToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const firstDot = token.indexOf('.');
  if (firstDot === -1) {
    return null;
  }

  const payload = token.slice(0, firstDot);
  const signature = token.slice(firstDot + 1);
  if (!payload || !signature) {
    return null;
  }

  let valid = false;
  try {
    valid = await verifyValueSignature(payload, signature, secret);
  } catch (_) {
    valid = false;
  }

  if (!valid) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64UrlToString(payload));
  } catch (_) {
    return null;
  }
}

function buildRelativeUrlWithParam(returnTo, key, value) {
  const url = new URL(returnTo, 'https://naimean.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function sanitizeReturnPath(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return '/';
  }

  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('/')) {
    return '/';
  }
  const lowered = trimmed.toLowerCase();
  if (
    trimmed.startsWith('//')
    || trimmed.includes('\r')
    || trimmed.includes('\n')
    || lowered.includes('%0d')
    || lowered.includes('%0a')
  ) {
    return '/';
  }
  return trimmed;
}

function getAuthConfig(env) {
  const clientId = typeof env.DISCORD_CLIENT_ID === 'string' ? env.DISCORD_CLIENT_ID.trim() : '';
  const clientSecret = typeof env.DISCORD_CLIENT_SECRET === 'string' ? env.DISCORD_CLIENT_SECRET.trim() : '';
  const redirectUri = typeof env.DISCORD_REDIRECT_URI === 'string' ? env.DISCORD_REDIRECT_URI.trim() : '';
  const sessionSecret = typeof env.SESSION_SECRET === 'string' ? env.SESSION_SECRET.trim() : '';

  const valid = clientId && clientSecret && redirectUri && sessionSecret;
  return {
    clientId,
    clientSecret,
    redirectUri,
    sessionSecret,
    isConfigured: Boolean(valid),
  };
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

async function getSessionFromRequest(request, env) {
  const config = getAuthConfig(env);
  if (!config.sessionSecret) {
    return null;
  }

  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  const payload = await readSignedToken(token, config.sessionSecret);
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) {
    return null;
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    return null;
  }

  return payload;
}

async function handleAuthSession(request, env, origin) {
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return jsonResponse({ authenticated: false }, 200, origin, env);
  }

  return jsonResponse({
    authenticated: true,
    user: {
      id: session.sub,
      username: session.username || '',
      displayName: session.displayName || '',
      avatar: session.avatar || '',
    },
  }, 200, origin, env);
}

async function handleAuthLogout(request, env, origin, url) {
  // CSRF guard: require the request to originate from an allowed origin.
  // SameSite=Lax cookies prevent cross-site POST in modern browsers, but an
  // explicit origin check provides defence-in-depth for older clients and
  // non-browser environments.
  if (origin && !isAllowedOrigin(origin, env)) {
    return jsonResponse({ error: 'Forbidden' }, 403, origin, env);
  }

  const clearSessionCookie = serializeCookie(SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    secure: shouldUseSecureCookie(url),
  });

  return jsonResponse(
    { ok: true },
    200,
    origin,
    env,
    { 'Set-Cookie': clearSessionCookie },
  );
}

async function handleDiscordLogin(request, env, url) {
  const config = getAuthConfig(env);
  if (!config.isConfigured) {
    return jsonResponse({ error: 'Discord OAuth not configured' }, 503, request.headers.get('Origin') || '', env);
  }

  const returnToRaw = new URL(request.url).searchParams.get('returnTo');
  const returnTo = sanitizeReturnPath(returnToRaw);
  const state = randomBase64Url(18);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const expiresAt = Date.now() + (OAUTH_FLOW_TTL_SECONDS * 1000);
  const oauthPayload = {
    state,
    codeVerifier,
    returnTo,
    exp: expiresAt,
  };

  const oauthToken = await createSignedToken(oauthPayload, config.sessionSecret);
  const oauthCookie = serializeCookie(OAUTH_COOKIE_NAME, oauthToken, {
    maxAge: OAUTH_FLOW_TTL_SECONDS,
    secure: shouldUseSecureCookie(url),
  });

  const authorizeUrl = new URL(`${DISCORD_API_BASE_URL}/oauth2/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('scope', 'identify');
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  return createRedirectResponse(authorizeUrl.toString(), [oauthCookie]);
}

async function exchangeDiscordCodeForToken(config, code, codeVerifier) {
  const formBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`${DISCORD_API_BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!payload || typeof payload.access_token !== 'string' || !payload.access_token) {
    return null;
  }

  return payload.access_token;
}

async function fetchDiscordUserProfile(accessToken) {
  const response = await fetch(`${DISCORD_API_BASE_URL}/users/@me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const profile = await response.json();
  if (!profile || typeof profile.id !== 'string') {
    return null;
  }

  const displayName = typeof profile.global_name === 'string' && profile.global_name.trim()
    ? profile.global_name.trim()
    : (typeof profile.username === 'string' ? profile.username.trim() : '');

  return {
    id: profile.id,
    username: typeof profile.username === 'string' ? profile.username.trim() : '',
    displayName,
    avatar: typeof profile.avatar === 'string' ? profile.avatar : '',
  };
}

async function handleDiscordCallback(request, env, url) {
  const config = getAuthConfig(env);
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code') || '';
  const returnedState = requestUrl.searchParams.get('state') || '';
  const secureCookie = shouldUseSecureCookie(url);

  const clearOauthCookie = serializeCookie(OAUTH_COOKIE_NAME, '', {
    maxAge: 0,
    secure: secureCookie,
  });
  const clearSessionCookie = serializeCookie(SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    secure: secureCookie,
  });

  if (!config.isConfigured) {
    return createRedirectResponse('/?auth=not_configured', [clearOauthCookie, clearSessionCookie]);
  }

  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const oauthState = await readSignedToken(cookies[OAUTH_COOKIE_NAME], config.sessionSecret);
  const returnTo = sanitizeReturnPath(oauthState?.returnTo || '/');

  if (!oauthState || !returnedState || !code) {
    return createRedirectResponse(buildRelativeUrlWithParam(returnTo, 'auth', 'missing'), [clearOauthCookie]);
  }

  if (!Number.isFinite(oauthState.exp) || oauthState.exp < Date.now()) {
    return createRedirectResponse(buildRelativeUrlWithParam(returnTo, 'auth', 'expired'), [clearOauthCookie]);
  }

  if (oauthState.state !== returnedState || typeof oauthState.codeVerifier !== 'string' || !oauthState.codeVerifier) {
    return createRedirectResponse(buildRelativeUrlWithParam(returnTo, 'auth', 'state'), [clearOauthCookie]);
  }

  const accessToken = await exchangeDiscordCodeForToken(config, code, oauthState.codeVerifier);
  if (!accessToken) {
    return createRedirectResponse(buildRelativeUrlWithParam(returnTo, 'auth', 'token'), [clearOauthCookie]);
  }

  const profile = await fetchDiscordUserProfile(accessToken);
  if (!profile) {
    return createRedirectResponse(buildRelativeUrlWithParam(returnTo, 'auth', 'profile'), [clearOauthCookie]);
  }

  const sessionPayload = {
    sub: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatar: profile.avatar,
    exp: Date.now() + (SESSION_TTL_SECONDS * 1000),
  };
  const sessionToken = await createSignedToken(sessionPayload, config.sessionSecret);
  const sessionCookie = serializeCookie(SESSION_COOKIE_NAME, sessionToken, {
    maxAge: SESSION_TTL_SECONDS,
    secure: secureCookie,
  });

  return createRedirectResponse(buildRelativeUrlWithParam(returnTo, 'auth', 'success'), [clearOauthCookie, sessionCookie]);
}

const GO_ROUTE_TOOL_MAP = {
  '/go/whiteboard': 'TOOL_URL_WHITEBOARD',
  '/go/capex': 'TOOL_URL_CAPEX',
  '/go/snow': 'TOOL_URL_SNOW',
};
const GO_ROUTE_DEFAULT_TOOL_URL_BY_ENV_KEY = {
  TOOL_URL_WHITEBOARD: 'https://whiteboard.cloud.microsoft/?lng=en-us&ref=oib-8ad27b9b-cce3-40c7-b658-b40c8163d34a',
  TOOL_URL_CAPEX: 'https://app.smartsheet.com/b/form/70b07591b76a4289bc6f5d5e1aabac91',
  TOOL_URL_SNOW: 'https://recoverycoa.okta.com/app/servicenow_ud/exk76nqofjVLeLdqj697/sso/saml?SAMLRequest=nVNdb%2BIwEPwrkd%2FzCQSwCFIu6HRIXA9Brg%2F3UrnOpnWb2MHrBPrvLwlpy0OLrvfqnZ2dmV0vkJVFUNG4No9yB4ca0FinspBIz5WI1FpSxVAglawEpIbTffxzQwPHo5VWRnFVECtGBG2EkomSWJeg96AbweH3bhORR2MqpK6rgasG9AtXzMFz3Zbq6HBVupI1FXsAJ1PEWrUqhGQd3cfN6tmwvotVlTswtUR3debC6XkayoPKn243sMkOT%2BF86iIqt%2FNDrO9Kc%2BjdRiRnBQKx1quI7G8SPgJvOg4nMJ5NvOk8zOfBOBgFo3vg3PNmoxaIW4YoGnhvRaxhLdEwaSISeEFoe2M78FJ%2FRoM59X0nnIR%2FiLUdcvomZCbkw%2FVQ788gpD%2FSdGtvf%2B3TnqARGeibFv31PG9BY59lS0%2BWi36ztNeuL5d9XRZ73TBZ%2FsP8hXs5ZZhZ0U7%2FerVVheAvVlwU6phoYKb1ZHQN%2FXpKZj4X4jt%2B%2FyIyO%2B%2BhFEomijjLNCAS923QcMuQ9btuj9LAyViJKiumBXZZwIlx85bGJSwpWq87yP8rm6swTnnH3T53l3RUOusuA3irM9VMYqW0eU3uI0XLofiJv%2Ffy5X9e%2FgU%3D&RelayState=62e1d93a83d883105c84f2efeeaad314',
};

async function handleGoRedirect(pathname, request, env, origin) {
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return jsonResponse({ error: 'Unauthorized' }, 401, origin, env);
  }

  const envKey = GO_ROUTE_TOOL_MAP[pathname];
  if (!envKey) {
    return jsonResponse({ error: 'Not found' }, 404, origin, env);
  }

  const configuredDestination = typeof env[envKey] === 'string' ? env[envKey].trim() : '';
  const destination = configuredDestination || GO_ROUTE_DEFAULT_TOOL_URL_BY_ENV_KEY[envKey] || '';
  if (!destination) {
    return jsonResponse({ error: 'Tool URL not configured' }, 503, origin, env);
  }

  let destinationUrl;
  try {
    destinationUrl = new URL(destination);
  } catch (_) {
    return jsonResponse({ error: 'Tool URL not configured' }, 503, origin, env);
  }

  if (destinationUrl.protocol !== 'https:') {
    return jsonResponse({ error: 'Tool URL not configured' }, 503, origin, env);
  }

  // Use 303 (See Other) for cross-origin redirects so that:
  //  - the method is always changed to GET on follow,
  //  - the referrer is suppressed by the Referrer-Policy: no-referrer header
  //    applied by applyApiSecurityHeaders, preventing the destination from
  //    seeing the originating URL.
  return new Response(null, {
    status: 303,
    headers: {
      Location: destinationUrl.toString(),
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const isSecureTransport = url.protocol === 'https:';
    const { pathname } = url;
    const isGetRoute = pathname === '/get';
    const isHitRoute = pathname === '/hit' || pathname === '/increment';
    const isCounterRoute = isGetRoute || isHitRoute;
    const isAuthRoute = pathname.startsWith('/auth/');
    const isGoRoute = pathname.startsWith('/go/');
    const withApiSecurityHeaders = (response) => applyApiSecurityHeaders(response, isSecureTransport);

    // Serve static assets for all non-counter/non-auth/non-go paths.
    if (!isCounterRoute && !isAuthRoute && !isGoRoute) {
      return env.ASSETS.fetch(request);
    }

    // Handle CORS pre-flight for API routes.
    if ((isCounterRoute || isAuthRoute || isGoRoute) && request.method === 'OPTIONS') {
      return withApiSecurityHeaders(new Response(null, { status: 204, headers: corsHeaders(origin, env) }));
    }

    try {
      // ── Rate limiting ─────────────────────────────────────────────────────
      if (isRateLimitEnabled(env)) {
        const clientIp = getClientIp(request);
        let routeKey;

        if (isGetRoute) {
          routeKey = 'get';
        } else if (isHitRoute) {
          routeKey = 'hit';
        } else if (pathname === '/auth/session') {
          routeKey = 'auth_session';
        } else if (pathname === '/auth/discord/login') {
          routeKey = 'auth_login';
        } else if (pathname === '/auth/discord/callback') {
          routeKey = 'auth_callback';
        } else if (pathname === '/auth/logout') {
          routeKey = 'auth_logout';
        } else if (isGoRoute) {
          routeKey = 'go';
        }

        if (routeKey) {
          const rl = checkRateLimit(clientIp, routeKey, RATE_LIMITS[routeKey]);
          if (!rl.allowed) {
            return withApiSecurityHeaders(rateLimitedResponse(rl.resetAt, origin, env));
          }
        }
      }

      // ── Counter routes (GET only) ─────────────────────────────────────────
      if (request.method === 'GET' && isGetRoute) {
        const value = await getCount(env.DB);
        return withApiSecurityHeaders(jsonResponse({ value }, 200, origin, env));
      }

      if (request.method === 'POST' && isHitRoute) {
        const value = await incrementCount(env.DB);
        return withApiSecurityHeaders(jsonResponse({ value }, 200, origin, env));
      }

      // ── Auth routes ────────────────────────────────────────────────────────
      if (request.method === 'GET' && pathname === '/auth/session') {
        return withApiSecurityHeaders(await handleAuthSession(request, env, origin));
      }

      if (request.method === 'POST' && pathname === '/auth/logout') {
        return withApiSecurityHeaders(await handleAuthLogout(request, env, origin, url));
      }

      if (request.method === 'GET' && pathname === '/auth/discord/login') {
        return withApiSecurityHeaders(await handleDiscordLogin(request, env, url));
      }

      if (request.method === 'GET' && pathname === '/auth/discord/callback') {
        return withApiSecurityHeaders(await handleDiscordCallback(request, env, url));
      }

      // ── Go routes (authenticated server-side redirects) ────────────────────
      if (request.method === 'GET' && isGoRoute) {
        return withApiSecurityHeaders(await handleGoRedirect(pathname, request, env, origin));
      }

      return withApiSecurityHeaders(jsonResponse({ error: 'Method not allowed' }, 405, origin, env));
    } catch (err) {
      console.error('Worker error:', err);
      return withApiSecurityHeaders(jsonResponse({ error: 'Internal server error' }, 500, origin, env));
    }
  },
};
