#!/usr/bin/env node
/**
 * router-bridge/bridge.js
 *
 * Polls the Cloudflare Worker for a pending router reboot command and, if one
 * is found, logs into the Netgear Nighthawk RS200 admin panel, triggers a
 * reboot, then acknowledges back to the worker so the site can show "done".
 *
 * Requirements:
 *   - Node.js 18+ (built-in fetch)
 *   - dotenv  (npm install)
 *   - A .env file in this directory (copy from .env.example and fill in)
 *
 * Run once:          node bridge.js
 * Run with pm2:      pm2 start bridge.js --name router-bridge
 * Run with systemd:  see README.md
 *
 * RS200 API notes:
 *   Login : POST http://<ROUTER_IP>/api/auth        { username, password }
 *   Reboot: POST http://<ROUTER_IP>/api/system/reboot  (with session cookie)
 *
 *   If your firmware version uses a different endpoint, update ROUTER_LOGIN_PATH
 *   and ROUTER_REBOOT_PATH in .env.
 */

import 'dotenv/config';

const {
  WORKER_URL,
  ROUTER_SECRET,
  ROUTER_IP           = '192.168.1.1',
  ROUTER_USER         = 'admin',
  ROUTER_PASS,
  ROUTER_LOGIN_PATH   = '/api/auth',
  ROUTER_REBOOT_PATH  = '/api/system/reboot',
} = process.env;

const POLL_INTERVAL_MS = 30_000;
const ROUTER_BASE      = `http://${ROUTER_IP}`;

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg, err) {
  console.error(`[${new Date().toISOString()}] ${msg}`, err?.message ?? err ?? '');
}

// ── Startup validation ────────────────────────────────────────────────────────

function assertConfig() {
  const missing = ['WORKER_URL', 'ROUTER_SECRET', 'ROUTER_PASS'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example → .env and fill in all values.');
    process.exit(1);
  }
}

// ── Worker API ────────────────────────────────────────────────────────────────

async function checkPending() {
  const res = await fetch(`${WORKER_URL}/router/status`, {
    cache:   'no-store',
    headers: { 'X-Router-Secret': ROUTER_SECRET },
  });
  if (!res.ok) throw new Error(`Worker /router/status returned HTTP ${res.status}`);
  const { pending } = await res.json();
  return Boolean(pending);
}

async function ack() {
  const res = await fetch(`${WORKER_URL}/router/ack`, {
    method:  'POST',
    headers: { 'X-Router-Secret': ROUTER_SECRET },
  });
  if (!res.ok) throw new Error(`Worker /router/ack returned HTTP ${res.status}`);
}

// ── RS200 API ─────────────────────────────────────────────────────────────────

/**
 * Authenticate with the RS200 REST API.
 * Returns the session cookie string to pass on subsequent requests.
 */
async function routerLogin() {
  const res = await fetch(`${ROUTER_BASE}${ROUTER_LOGIN_PATH}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: ROUTER_USER, password: ROUTER_PASS }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Router login failed (HTTP ${res.status}): ${body}`);
  }

  // Grab the first name=value pair from the Set-Cookie header.
  const cookie = res.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('Router login succeeded but no session cookie was returned.');
  }
  return cookie.split(';')[0];
}

/**
 * Send the reboot command to the RS200.
 * The router drops the connection immediately after accepting the command,
 * so a network error at this point is treated as success.
 */
async function routerReboot(sessionCookie) {
  try {
    const res = await fetch(`${ROUTER_BASE}${ROUTER_REBOOT_PATH}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie':        sessionCookie,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Reboot command failed (HTTP ${res.status}): ${body}`);
    }
  } catch (err) {
    // A fetch/network error here most likely means the router closed the
    // connection as it began rebooting — treat it as success.
    if (err.name === 'TypeError' || err.cause?.code === 'ECONNRESET') {
      log('Router closed the connection (expected during reboot).');
      return;
    }
    throw err;
  }
}

// ── Main reboot flow ──────────────────────────────────────────────────────────

async function handleReboot() {
  log('Reboot pending — logging in to RS200...');
  const sessionCookie = await routerLogin();
  log('Login successful — sending reboot command...');
  await routerReboot(sessionCookie);
  log('Reboot command accepted — acknowledging to worker...');
  await ack();
  log('Done. Router is rebooting. Expect ~60s of downtime.');
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll() {
  try {
    const pending = await checkPending();
    if (pending) {
      await handleReboot();
    }
  } catch (err) {
    logError('Poll error:', err);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

assertConfig();

log(`Bridge started. Worker: ${WORKER_URL}`);
log(`Router: ${ROUTER_BASE} (user: ${ROUTER_USER})`);
log(`Polling every ${POLL_INTERVAL_MS / 1000}s.`);

poll();
setInterval(poll, POLL_INTERVAL_MS);
