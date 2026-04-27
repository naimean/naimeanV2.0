const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth", "/go", "/layout", "/icon"];

// Paths that are handled by the Worker first but served from R2 (not proxied to COUNTER).
// Must stay in sync with run_worker_first in wrangler.toml (checked by scripts/check-route-alignment.js).
const R2_PATHS = ["/assets/retroarch/cores/"];

// HTML pages that require the Apple Music developer token injected before serving.
// Worker must run first for these paths — keep in sync with run_worker_first in wrangler.toml.
const JUKEBOX_INJECT_PATHS = ["/jukebox"];

const UPLOADS_HOSTNAME = 'uploads.naimean.com';

// Requests under this prefix are served from the CORES R2 bucket instead of ASSETS.
// This path is declared in R2_PATHS and run_worker_first — keep all three in sync.
const CORES_R2_PATH_PREFIX = '/assets/retroarch/cores/';

const DOCUMENT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.emulatorjs.org https://cdn.jsdelivr.net https://js-cdn.music.apple.com https://static.cloudflareinsights.com",
  // 'wasm-unsafe-eval' allows WebAssembly compilation at runtime (required by EmulatorJS cores).
  // 'unsafe-eval' is required because the EmulatorJS 7-Zip decompression worker (extract7z.js)
  // is Emscripten-generated and calls eval() internally to decompress .wasm.data core archives.
  // This is the narrowest viable fix: isolating EmulatorJS in a sandboxed iframe would remove
  // the need for 'unsafe-eval' on the main document but requires significant restructuring.
  // Note: 'unsafe-inline' (already present) is the higher XSS risk; 'unsafe-eval' is incremental.
  // loader.js, emulator.min.js, and emulator.min.css are self-hosted in /assets/retroarch/ and
  // served via 'self'. CDN is still listed as a fallback and for system cores (WASM).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.emulatorjs.org https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net https://cdn.emulatorjs.org https://cdn.jsdelivr.net https://*.mzstatic.com",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://www.naimean.com https://discord.com https://*.discord.com https://*.workers.dev https://*.naimean.workers.dev https://cdn.emulatorjs.org https://cdn.jsdelivr.net https://api.music.apple.com https://amp-api.music.apple.com https://amp-api-edge.music.apple.com https://static.cloudflareinsights.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://discord.com https://*.discord.com https://archive.org https://oregontrail.ws",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// Static asset paths that benefit from long-lived caching (content-addressed or versioned).
const IMMUTABLE_ASSET_EXTENSIONS = ['.mp4', '.mp3', '.jpg', '.jpeg', '.png', '.webp', '.avif', '.woff2', '.woff', '.data'];

// Returns true for any request pathname that maps to a jukebox injection page.
// Handles the canonical path (/jukebox), trailing-slash (/jukebox/), and
// direct HTML file requests (/jukebox.html), all derived from JUKEBOX_INJECT_PATHS.
function isJukeboxPage(pathname) {
  return JUKEBOX_INJECT_PATHS.some(
    (p) => pathname === p || pathname === p + '/' || pathname === p + '.html',
  );
}

// Injects window.NAIMEAN_APPLE_MUSIC_DEVELOPER_TOKEN into a jukebox HTML response
// when env.APPLE_MUSIC_TOKEN is configured as a Worker secret. Returns the original
// response unchanged when the token is absent, malformed, or the response is not HTML.
async function injectAppleMusicToken(response, env) {
  const token = typeof env.APPLE_MUSIC_TOKEN === 'string' ? env.APPLE_MUSIC_TOKEN.trim() : '';
  if (!token) return response;

  // Validate token looks like a JWT (three base64url segments) before injecting.
  if (!/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token)) return response;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const injected = html.replace(
    '</head>',
    `<script>window.NAIMEAN_APPLE_MUSIC_DEVELOPER_TOKEN=${JSON.stringify(token)};</script></head>`,
  );

  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

function isImmutableAsset(pathname) {
  const lower = pathname.toLowerCase();
  return IMMUTABLE_ASSET_EXTENSIONS.some((ext) => lower.endsWith(ext));
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

function applyEdgeSecurityHeaders(response, isSecureTransport, pathname) {
  const headers = new Headers(response.headers);
  const contentType = (headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('text/html')) {
    headers.set('Content-Security-Policy', DOCUMENT_CSP);
    // HTML documents must never be cached at the edge to ensure security
    // headers and content are always fresh.
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', 'no-cache, must-revalidate');
    }
  } else {
    // API and all other response types get the strict API CSP.
    headers.set('Content-Security-Policy', API_CSP);
    // Long-lived cache for static media/font assets that do not change.
    if (!headers.has('Cache-Control') && response.status === 200 && isImmutableAsset(pathname)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }

  // Apply baseline security headers to every response regardless of content type.
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isSecureTransport = url.protocol === 'https:';
    let upstreamResponse;

    if (url.hostname === UPLOADS_HOSTNAME) {
      // Rewrite uploads.naimean.com/<path> → ASSETS at /assets/uploads/<path>
      const rewritten = new URL(request.url);
      rewritten.hostname = 'naimean.com';
      rewritten.pathname = `/assets/uploads${url.pathname}`;
      upstreamResponse = await env.ASSETS.fetch(new Request(rewritten.toString(), request));
    } else if (PROXY_PATHS.some((path) => url.pathname.startsWith(path))) {
      upstreamResponse = await env.COUNTER.fetch(request);
    } else if (env.CORES && url.pathname.startsWith(CORES_R2_PATH_PREFIX) &&
        (url.pathname.endsWith('.data') || url.pathname.endsWith('.js') || url.pathname.endsWith('.wasm'))) {
      // Serve EmulatorJS core archives from R2 with ETag-based cache busting.
      // Handles .data (current EJS 4.x format), .js, and .wasm (future-proof).
      const key = url.pathname.slice(CORES_R2_PATH_PREFIX.length);
      const coreContentType = url.pathname.endsWith('.js')
        ? 'application/javascript'
        : url.pathname.endsWith('.wasm')
          ? 'application/wasm'
          : 'application/octet-stream';

      const buildCoreHeaders = (size, etag) => {
        const h = new Headers({
          'Content-Type': coreContentType,
          'Content-Length': String(size),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        });
        if (etag) h.set('ETag', etag);
        return h;
      };

      if (request.method === 'HEAD') {
        // Use R2 head() for HEAD requests — fetches only metadata, not the body.
        // This ensures Content-Type and Content-Length are correct without
        // streaming the full file, and prevents the runtime from zeroing
        // Content-Length when creating a body-less response.
        const coreMeta = await env.CORES.head(key);
        if (!coreMeta) {
          upstreamResponse = new Response(null, { status: 404 });
        } else {
          upstreamResponse = new Response(null, { status: 200, headers: buildCoreHeaders(coreMeta.size, coreMeta.httpEtag) });
        }
      } else {
        const coreObj = await env.CORES.get(key);
        if (!coreObj) {
          upstreamResponse = new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
        } else {
          const ifNoneMatch = request.headers.get('If-None-Match');
          const coreHeaders = buildCoreHeaders(coreObj.size, coreObj.httpEtag);
          if (coreObj.httpEtag && ifNoneMatch === coreObj.httpEtag) {
            // Conditional request matched — 304, no body, security headers still applied below.
            upstreamResponse = new Response(null, { status: 304, headers: coreHeaders });
          } else {
            upstreamResponse = new Response(coreObj.body, { status: 200, headers: coreHeaders });
          }
        }
      }
    } else {
      upstreamResponse = await env.ASSETS.fetch(request);
      if (
        upstreamResponse.status === 404
        && request.method === 'GET'
      ) {
        const htmlFallbackPaths = buildHtmlFallbackPaths(url.pathname);
        for (const fallbackPath of htmlFallbackPaths) {
          const htmlUrl = new URL(request.url);
          htmlUrl.pathname = fallbackPath;
          const fallbackResponse = await env.ASSETS.fetch(new Request(htmlUrl.toString(), request));
          if (fallbackResponse.status !== 404) {
            upstreamResponse = fallbackResponse;
            break;
          }
        }
      }
    }

    if (isJukeboxPage(url.pathname) && upstreamResponse.status === 200) {
      upstreamResponse = await injectAppleMusicToken(upstreamResponse, env);
    }

    return applyEdgeSecurityHeaders(upstreamResponse, isSecureTransport, url.pathname);
  },
};
