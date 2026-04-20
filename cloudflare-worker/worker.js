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
 *   GET  /hit  – increment the counter by 1, return the new value
 *   GET  /increment  – alias of /hit for backward compatibility
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
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const OAUTH_FLOW_TTL_SECONDS = 60 * 10; // 10 minutes
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
const textEncoder = new TextEncoder();

function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) {
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

function isAllowedOrigin(origin) {
  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    return hostname === 'naimean.com'
      || hostname === 'www.naimean.com'
      || hostname === 'naimean.github.io'
      || hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname.endsWith('.naimean.com')
      || hostname.endsWith('.pages.dev');
  } catch (_) {
    return false;
  }
}

function jsonResponse(data, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...corsHeaders(origin),
      ...extraHeaders,
    },
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
  if (trimmed.startsWith('//') || trimmed.includes('\r') || trimmed.includes('\n')) {
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

  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
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
    return jsonResponse({ authenticated: false }, 200, origin);
  }

  return jsonResponse({
    authenticated: true,
    user: {
      id: session.sub,
      username: session.username || '',
      displayName: session.displayName || '',
      avatar: session.avatar || '',
    },
  }, 200, origin);
}

async function handleAuthLogout(request, env, origin, url) {
  const clearSessionCookie = serializeCookie(SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    secure: shouldUseSecureCookie(url),
  });

  return jsonResponse(
    { ok: true },
    200,
    origin,
    { 'Set-Cookie': clearSessionCookie },
  );
}

async function handleDiscordLogin(request, env, url) {
  const config = getAuthConfig(env);
  if (!config.isConfigured) {
    return jsonResponse({ error: 'Discord OAuth not configured' }, 503, request.headers.get('Origin') || '');
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

  if (!Number.isFinite(oauthState.exp) || oauthState.exp <= Date.now()) {
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const { pathname } = url;
    const isGetRoute = pathname === '/get';
    const isHitRoute = pathname === '/hit' || pathname === '/increment';
    const isCounterRoute = isGetRoute || isHitRoute;
    const isAuthRoute = pathname.startsWith('/auth/');

    // Serve static assets for all non-counter/non-auth paths.
    if (!isCounterRoute && !isAuthRoute) {
      return env.ASSETS.fetch(request);
    }

    // Handle CORS pre-flight for API routes.
    if ((isCounterRoute || isAuthRoute) && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // ── Counter routes (GET only) ─────────────────────────────────────────
      if (request.method === 'GET' && isGetRoute) {
        const value = await getCount(env.DB);
        return jsonResponse({ value }, 200, origin);
      }

      if (request.method === 'GET' && isHitRoute) {
        const value = await incrementCount(env.DB);
        return jsonResponse({ value }, 200, origin);
      }

      // ── Auth routes ────────────────────────────────────────────────────────
      if (request.method === 'GET' && pathname === '/auth/session') {
        return handleAuthSession(request, env, origin);
      }

      if (request.method === 'POST' && pathname === '/auth/logout') {
        return handleAuthLogout(request, env, origin, url);
      }

      if (request.method === 'GET' && pathname === '/auth/discord/login') {
        return handleDiscordLogin(request, env, url);
      }

      if (request.method === 'GET' && pathname === '/auth/discord/callback') {
        return handleDiscordCallback(request, env, url);
      }

      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500, origin);
    }
  },
};
