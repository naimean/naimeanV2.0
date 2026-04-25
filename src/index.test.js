import { test } from 'node:test';
import assert from 'node:assert/strict';
import router from './index.js';

function makeEnv(overrides = {}) {
  const calls = {
    counter: [],
    assets: [],
  };

  const env = {
    COUNTER: {
      async fetch(request) {
        calls.counter.push(new URL(request.url).pathname + new URL(request.url).search);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        calls.assets.push(url.pathname);
        if (url.pathname === '/bedroom.html') {
          return new Response('<!doctype html><title>Bedroom</title>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        if (url.pathname === '/assets/test.png') {
          return new Response('png', {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          });
        }
        if (url.pathname.startsWith('/assets/uploads/')) {
          return new Response('upload-data', {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }
        return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      },
    },
    ...overrides,
  };

  return { env, calls };
}

test('edge router forwards every proxied backend route to COUNTER', async () => {
  const { env, calls } = makeEnv();
  const requests = [
    new Request('https://naimean.com/get'),
    new Request('https://naimean.com/hit', { method: 'POST' }),
    new Request('https://naimean.com/increment', { method: 'POST' }),
    new Request('https://naimean.com/auth/session'),
    new Request('https://naimean.com/go/whiteboard'),
    new Request('https://naimean.com/layout?page=chapel'),
  ];

  for (const request of requests) {
    const response = await router.fetch(request, env, {});
    assert.strictEqual(response.status, 200);
  }

  assert.deepEqual(calls.counter, [
    '/get',
    '/hit',
    '/increment',
    '/auth/session',
    '/go/whiteboard',
    '/layout?page=chapel',
  ]);
  assert.deepEqual(calls.assets, []);
});

test('edge router serves non-proxied HTML from ASSETS with document security headers', async () => {
  const { env, calls } = makeEnv({
    ASSETS: {
      async fetch(request) {
        calls.assets.push(new URL(request.url).pathname);
        return new Response('<!doctype html><title>Home</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      },
    },
  });

  const response = await router.fetch(new Request('https://naimean.com/'), env, {});

  assert.strictEqual(response.status, 200);
  assert.deepEqual(calls.assets, ['/']);
  assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
  assert.match(response.headers.get('Content-Security-Policy') || '', /default-src 'self'/);
  assert.strictEqual(response.headers.get('Cache-Control'), 'no-cache, must-revalidate');
});

test('document CSP includes all EmulatorJS-required directives', async () => {
  const { env } = makeEnv({
    ASSETS: {
      async fetch() {
        return new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      },
    },
  });

  const response = await router.fetch(new Request('https://naimean.com/'), env, {});
  const csp = response.headers.get('Content-Security-Policy') || '';

  // extract7z.js (7z decompressor) is Emscripten-generated and calls eval() inside a blob Worker
  assert.match(csp, /'unsafe-eval'/, "script-src must include 'unsafe-eval' for EmulatorJS 7z decompressor");

  // EmulatorJS cores are compiled WebAssembly modules loaded from ArrayBuffers
  assert.match(csp, /'wasm-unsafe-eval'/, "script-src must include 'wasm-unsafe-eval' for EmulatorJS WASM cores");

  // EmulatorJS core JS module is injected via <script src="blob:..."> from a Blob
  // Use (?:[^;]|$)* so the pattern works whether or not a trailing ';' is present.
  assert.match(csp, /script-src(?:[^;]|$)*blob:/, "script-src must include blob: for EmulatorJS core module injection");

  // EmulatorJS decompressor and emulator core run in blob: Workers
  assert.match(csp, /worker-src(?:[^;]|$)*blob:/, "worker-src must include blob: for EmulatorJS blob Workers");

  // Primary CDN: loader.js, emulator.min.js loaded as <script>; cores/ROMs fetched via XHR
  assert.match(csp, /script-src(?:[^;]|$)*https:\/\/cdn\.emulatorjs\.org/, "script-src must include cdn.emulatorjs.org");
  assert.match(csp, /connect-src(?:[^;]|$)*https:\/\/cdn\.emulatorjs\.org/, "connect-src must include cdn.emulatorjs.org for XHR core/asset fetches");

  // Fallback CDN: jsDelivr used when primary CDN fails
  assert.match(csp, /script-src(?:[^;]|$)*https:\/\/cdn\.jsdelivr\.net/, "script-src must include cdn.jsdelivr.net for CDN fallback");
  assert.match(csp, /connect-src(?:[^;]|$)*https:\/\/cdn\.jsdelivr\.net/, "connect-src must include cdn.jsdelivr.net for CDN fallback XHR");
});

test('edge router falls back to extensionless html asset paths', async () => {
  const { env, calls } = makeEnv();

  const response = await router.fetch(new Request('https://naimean.com/bedroom'), env, {});

  assert.strictEqual(response.status, 200);
  assert.deepEqual(calls.assets, ['/bedroom', '/bedroom.html']);
  assert.match(await response.text(), /Bedroom/);
});

test('edge router applies immutable caching headers to versioned static media', async () => {
  const { env } = makeEnv();

  const response = await router.fetch(new Request('https://naimean.com/assets/test.png'), env, {});

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.strictEqual(response.headers.get('Content-Security-Policy'), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
});

test('uploads subdomain rewrites path to /assets/uploads and serves from ASSETS', async () => {
  const { env, calls } = makeEnv();

  const response = await router.fetch(new Request('https://uploads.naimean.com/photo.jpg'), env, {});

  assert.strictEqual(response.status, 200);
  assert.deepEqual(calls.assets, ['/assets/uploads/photo.jpg']);
  assert.deepEqual(calls.counter, []);
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
});

test('uploads subdomain does not route proxy paths to COUNTER', async () => {
  const { env, calls } = makeEnv();

  const response = await router.fetch(new Request('https://uploads.naimean.com/get'), env, {});

  assert.deepEqual(calls.counter, []);
  assert.deepEqual(calls.assets, ['/assets/uploads/get']);
});

test('uploads subdomain preserves nested path segments', async () => {
  const { env, calls } = makeEnv();

  await router.fetch(new Request('https://uploads.naimean.com/2026/april/image.jpg'), env, {});

  assert.deepEqual(calls.assets, ['/assets/uploads/2026/april/image.jpg']);
});

test('uploads subdomain returns 404 for missing assets without HTML fallback', async () => {
  const { env, calls } = makeEnv({
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        calls.assets.push(url.pathname);
        return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      },
    },
  });

  const response = await router.fetch(new Request('https://uploads.naimean.com/missing.jpg'), env, {});

  assert.strictEqual(response.status, 404);
  assert.deepEqual(calls.assets, ['/assets/uploads/missing.jpg']);
  assert.deepEqual(calls.counter, []);
});
