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

test('edge router rewrites uploads subdomain requests to /assets/uploads/ path in ASSETS', async () => {
  const { env, calls } = makeEnv({
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        calls.assets.push(url.pathname);
        if (url.pathname === '/assets/uploads/photo.jpg') {
          return new Response('imgdata', {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }
        return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      },
    },
  });

  const response = await router.fetch(new Request('https://uploads.naimean.com/photo.jpg'), env, {});

  assert.strictEqual(response.status, 200);
  assert.deepEqual(calls.assets, ['/assets/uploads/photo.jpg']);
  assert.deepEqual(calls.counter, []);
  // image assets served via the uploads subdomain get immutable cache headers
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
});

test('edge router returns 404 for missing uploads subdomain asset without HTML fallback', async () => {
  const { env, calls } = makeEnv();

  const response = await router.fetch(new Request('https://uploads.naimean.com/missing.jpg'), env, {});

  assert.strictEqual(response.status, 404);
  // only the rewritten path should have been tried — no HTML fallback on the uploads subdomain
  assert.deepEqual(calls.assets, ['/assets/uploads/missing.jpg']);
  assert.deepEqual(calls.counter, []);
});
