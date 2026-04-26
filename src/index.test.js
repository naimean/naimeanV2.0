import { test } from 'node:test';
import assert from 'node:assert/strict';
import router from './index.js';

// ─── Inline copies of pure helpers from src/index.js ─────────────────────────
// These allow testing the helper functions directly without a Workers runtime.

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

test('R2 cores route: serves .data file from CORES with ETag and immutable cache headers', async () => {
  const coreBody = 'fake-core-binary-data';
  const { env, calls } = makeEnv({
    CORES: {
      async get(key) {
        calls.assets.push('r2:' + key);
        if (key === 'fceumm-wasm.data') {
          return {
            httpEtag: '"abc123"',
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(coreBody));
                controller.close();
              },
            }),
          };
        }
        return null;
      },
    },
  });

  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/fceumm-wasm.data'),
    env,
    {},
  );

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('ETag'), '"abc123"');
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.strictEqual(response.headers.get('Content-Type'), 'application/octet-stream');
  assert.deepEqual(calls.assets, ['r2:fceumm-wasm.data']);
  assert.deepEqual(calls.counter, []);
});

test('R2 cores route: returns 304 on If-None-Match ETag match (cache busting)', async () => {
  const { env } = makeEnv({
    CORES: {
      async get(key) {
        if (key === 'fceumm-wasm.data') {
          return {
            httpEtag: '"abc123"',
            body: new ReadableStream({ start(c) { c.close(); } }),
          };
        }
        return null;
      },
    },
  });

  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/fceumm-wasm.data', {
      headers: { 'If-None-Match': '"abc123"' },
    }),
    env,
    {},
  );

  assert.strictEqual(response.status, 304);
  assert.strictEqual(response.headers.get('ETag'), '"abc123"');
  assert.strictEqual(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  // Security headers must still be applied to 304 responses.
  assert.strictEqual(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
});

test('R2 cores route: returns 304 only when ETag matches, not when different', async () => {
  const coreBody = 'updated-core-data';
  const { env } = makeEnv({
    CORES: {
      async get(key) {
        if (key === 'fceumm-wasm.data') {
          return {
            httpEtag: '"newetag456"',
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(coreBody));
                controller.close();
              },
            }),
          };
        }
        return null;
      },
    },
  });

  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/fceumm-wasm.data', {
      headers: { 'If-None-Match': '"oldEtag"' },
    }),
    env,
    {},
  );

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('ETag'), '"newetag456"');
});

test('R2 cores route: returns 404 for unknown core key', async () => {
  const { env } = makeEnv({
    CORES: {
      async get() { return null; },
    },
  });

  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/unknown-wasm.data'),
    env,
    {},
  );

  assert.strictEqual(response.status, 404);
});

test('R2 cores route: non-.data requests under cores path fall through to ASSETS', async () => {
  const { env, calls } = makeEnv();

  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/reports/fceumm.json'),
    env,
    {},
  );

  // ASSETS returns 404 in the default mock for this path
  assert.strictEqual(response.status, 404);
  assert.ok(calls.assets.some((p) => p.includes('reports/fceumm.json')));
});

// ─── R2 Content-Type tests ────────────────────────────────────────────────────

test('R2 cores route: .js core file is served with application/javascript Content-Type', async () => {
  const { env } = makeEnv({
    CORES: {
      async get(key) {
        if (key === 'loader.js') return { body: '// loader', httpEtag: null };
        return null;
      },
    },
  });
  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/loader.js'),
    env,
    {},
  );
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('Content-Type'), 'application/javascript');
});

test('R2 cores route: .wasm core file is served with application/wasm Content-Type', async () => {
  const { env } = makeEnv({
    CORES: {
      async get(key) {
        if (key === 'core.wasm') return { body: 'wasm-data', httpEtag: null };
        return null;
      },
    },
  });
  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/core.wasm'),
    env,
    {},
  );
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('Content-Type'), 'application/wasm');
});

test('R2 cores route: falls through to ASSETS when CORES binding is absent', async () => {
  // Without a CORES key in env the condition `env.CORES && ...` is falsy, so
  // the request is handled by ASSETS instead.
  const { env, calls } = makeEnv(); // no CORES
  const response = await router.fetch(
    new Request('https://naimean.com/assets/retroarch/cores/snes9x.data'),
    env,
    {},
  );
  assert.strictEqual(response.status, 404);
  assert.ok(calls.assets.length > 0, 'ASSETS must be consulted when CORES is absent');
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
