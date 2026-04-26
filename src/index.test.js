import { test } from 'node:test';
import assert from 'node:assert/strict';
import router from './index.js';

// ─── Inline copies of pure helpers from src/index.js ─────────────────────────
// These are faithful copies of the unexported pure functions from src/index.js.
// The duplication is intentional—it follows the same pattern used in
// cloudflare-worker/worker.test.js so that pure helpers can be unit-tested
// under plain Node.js without needing a Workers-compatible bundler or Miniflare.

const IMMUTABLE_ASSET_EXTENSIONS_TEST = ['.mp4', '.mp3', '.jpg', '.jpeg', '.png', '.webp', '.avif', '.woff2', '.woff', '.data'];

function isImmutableAsset(pathname) {
  const lower = pathname.toLowerCase();
  return IMMUTABLE_ASSET_EXTENSIONS_TEST.some((ext) => lower.endsWith(ext));
}

function hasFileExtension(pathname) {
  return /\.[^/]+$/.test(pathname);
}

function buildHtmlFallbackPaths(pathname) {
  if (pathname === '/' || hasFileExtension(pathname)) {
    return [];
  }
  const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (!normalizedPath || normalizedPath === '/') {
    return [];
  }
  return [`${normalizedPath}.html`, `${normalizedPath}/index.html`];
}

// ─── isImmutableAsset tests ───────────────────────────────────────────────────

test('isImmutableAsset – recognized media and font extensions return true', () => {
  assert.ok(isImmutableAsset('/video.mp4'));
  assert.ok(isImmutableAsset('/audio.mp3'));
  assert.ok(isImmutableAsset('/image.jpg'));
  assert.ok(isImmutableAsset('/image.jpeg'));
  assert.ok(isImmutableAsset('/image.png'));
  assert.ok(isImmutableAsset('/image.webp'));
  assert.ok(isImmutableAsset('/image.avif'));
  assert.ok(isImmutableAsset('/font.woff2'));
  assert.ok(isImmutableAsset('/font.woff'));
  assert.ok(isImmutableAsset('/core.data'));
});

test('isImmutableAsset – non-immutable extensions return false', () => {
  assert.strictEqual(isImmutableAsset('/style.css'), false);
  assert.strictEqual(isImmutableAsset('/script.js'), false);
  assert.strictEqual(isImmutableAsset('/page.html'), false);
  assert.strictEqual(isImmutableAsset('/data.json'), false);
  assert.strictEqual(isImmutableAsset('/'), false);
  assert.strictEqual(isImmutableAsset('/path/noextension'), false);
});

test('isImmutableAsset – extension matching is case-insensitive', () => {
  assert.ok(isImmutableAsset('/IMAGE.JPG'));
  assert.ok(isImmutableAsset('/FONT.WOFF2'));
  assert.ok(isImmutableAsset('/Video.MP4'));
});

// ─── hasFileExtension tests ───────────────────────────────────────────────────

test('hasFileExtension – paths with a file extension return true', () => {
  assert.ok(hasFileExtension('/style.css'));
  assert.ok(hasFileExtension('/image.png'));
  assert.ok(hasFileExtension('/page.html'));
  assert.ok(hasFileExtension('/dir/file.js'));
});

test('hasFileExtension – paths without a file extension return false', () => {
  assert.strictEqual(hasFileExtension('/'), false);
  assert.strictEqual(hasFileExtension('/about'), false);
  assert.strictEqual(hasFileExtension('/about/'), false);
  assert.strictEqual(hasFileExtension('/nested/path'), false);
});

// ─── buildHtmlFallbackPaths tests ─────────────────────────────────────────────

test('buildHtmlFallbackPaths – root path returns empty array', () => {
  assert.deepEqual(buildHtmlFallbackPaths('/'), []);
});

test('buildHtmlFallbackPaths – path with a file extension returns empty array', () => {
  assert.deepEqual(buildHtmlFallbackPaths('/style.css'), []);
  assert.deepEqual(buildHtmlFallbackPaths('/page.html'), []);
  assert.deepEqual(buildHtmlFallbackPaths('/dir/image.png'), []);
});

test('buildHtmlFallbackPaths – clean extensionless path returns .html and /index.html variants', () => {
  assert.deepEqual(buildHtmlFallbackPaths('/about'), ['/about.html', '/about/index.html']);
  assert.deepEqual(buildHtmlFallbackPaths('/blog/post'), ['/blog/post.html', '/blog/post/index.html']);
});

test('buildHtmlFallbackPaths – trailing slash is stripped before building fallbacks', () => {
  assert.deepEqual(buildHtmlFallbackPaths('/about/'), ['/about.html', '/about/index.html']);
});

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

// ─── Security header edge-case tests ─────────────────────────────────────────

test('edge router: HSTS is set on HTTPS requests', async () => {
  const { env } = makeEnv();
  const response = await router.fetch(new Request('https://naimean.com/'), env, {});
  const hsts = response.headers.get('Strict-Transport-Security') || '';
  assert.ok(hsts.includes('max-age='), 'HSTS must be present for HTTPS');
  assert.ok(hsts.includes('includeSubDomains'), 'HSTS must include includeSubDomains');
});

test('edge router: HSTS is not set on plain HTTP requests', async () => {
  const { env } = makeEnv();
  const response = await router.fetch(new Request('http://naimean.com/'), env, {});
  assert.strictEqual(
    response.headers.get('Strict-Transport-Security'),
    null,
    'HSTS must not be set over plain HTTP',
  );
});

test('edge router: non-HTML responses carry the strict API CSP', async () => {
  const { env } = makeEnv();
  const response = await router.fetch(new Request('https://naimean.com/assets/test.png'), env, {});
  const csp = response.headers.get('Content-Security-Policy') || '';
  assert.ok(csp.includes("default-src 'none'"), 'API_CSP must be applied to non-HTML content');
});

test('edge router: baseline security headers are present on HTML responses', async () => {
  const { env } = makeEnv({
    ASSETS: {
      async fetch() {
        return new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      },
    },
  });
  const response = await router.fetch(new Request('https://naimean.com/'), env, {});
  assert.strictEqual(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
  assert.ok(response.headers.get('Referrer-Policy'), 'Referrer-Policy must be set');
  assert.ok(response.headers.get('Permissions-Policy'), 'Permissions-Policy must be set');
});

test('edge router: baseline security headers are present on non-HTML responses', async () => {
  const { env } = makeEnv();
  const response = await router.fetch(new Request('https://naimean.com/assets/test.png'), env, {});
  assert.strictEqual(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
  assert.ok(response.headers.get('Referrer-Policy'), 'Referrer-Policy must be set');
});

test('edge router: non-200 responses for immutable extensions do not receive long-lived Cache-Control', async () => {
  const { env } = makeEnv();
  // The default mock ASSETS returns 404 for /missing.png
  const response = await router.fetch(new Request('https://naimean.com/missing.png'), env, {});
  assert.strictEqual(response.status, 404);
  const cc = response.headers.get('Cache-Control') || '';
  assert.ok(!cc.includes('max-age=31536000'), 'A 404 image must not receive a long-lived Cache-Control');
});

test('edge router: a pre-existing Cache-Control header on HTML responses is preserved unchanged', async () => {
  const { env } = makeEnv({
    ASSETS: {
      async fetch() {
        return new Response('<html>cached</html>', {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'max-age=600',
          },
        });
      },
    },
  });
  const response = await router.fetch(new Request('https://naimean.com/'), env, {});
  assert.strictEqual(
    response.headers.get('Cache-Control'),
    'max-age=600',
    'Worker must not overwrite a Cache-Control already set by the origin',
  );
});

// ─── HTML fallback edge-case tests ────────────────────────────────────────────

test('edge router: POST to an extensionless missing path does not trigger HTML fallback', async () => {
  const { env, calls } = makeEnv({
    ASSETS: {
      async fetch(request) {
        calls.assets.push(new URL(request.url).pathname);
        return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      },
    },
  });
  const response = await router.fetch(
    new Request('https://naimean.com/bedroom', { method: 'POST' }),
    env,
    {},
  );
  assert.strictEqual(response.status, 404);
  // Only one call – no fallback attempts for POST
  assert.strictEqual(calls.assets.length, 1);
});

test('edge router: extensionless path with no matching fallback stays 404', async () => {
  const { env, calls } = makeEnv({
    ASSETS: {
      async fetch(request) {
        calls.assets.push(new URL(request.url).pathname);
        return new Response('missing', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      },
    },
  });
  const response = await router.fetch(
    new Request('https://naimean.com/no-such-page'),
    env,
    {},
  );
  assert.strictEqual(response.status, 404);
  // Root, .html, and index.html variants were all tried
  assert.ok(calls.assets.length > 1, 'Both fallback paths should have been tried');
});
