const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth", "/go", "/layout"];

const UPLOADS_HOSTNAME = 'uploads.naimean.com';

// EmulatorJS core archives (.data) are stored in the R2 bucket under this prefix.
// The worker serves them at the same URL path (/assets/retroarc/cores/*.data) so that
// EJS_pathtodata and loader.js require no changes.
const CORES_PATH_PREFIX = '/assets/retroarc/cores/';
const CORES_R2_PREFIX = 'retroarc/cores/';

const DOCUMENT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.emulatorjs.org https://cdn.jsdelivr.net",
  // 'wasm-unsafe-eval' allows WebAssembly compilation at runtime (required by EmulatorJS cores).
  // 'unsafe-eval' is required because the EmulatorJS 7-Zip decompression worker (extract7z.js)
  // is Emscripten-generated and calls eval() internally to decompress .wasm.data core archives.
  // This is the narrowest viable fix: isolating EmulatorJS in a sandboxed iframe would remove
  // the need for 'unsafe-eval' on the main document but requires significant restructuring.
  // Note: 'unsafe-inline' (already present) is the higher XSS risk; 'unsafe-eval' is incremental.
  // loader.js, emulator.min.js, and emulator.min.css are self-hosted in /assets/retroarc/ and
  // served via 'self'. CDN is still listed as a fallback and for system cores (WASM).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.emulatorjs.org https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net https://cdn.emulatorjs.org https://cdn.jsdelivr.net",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://discord.com https://*.discord.com https://*.workers.dev https://cdn.emulatorjs.org https://cdn.jsdelivr.net",
  "worker-src blob:",
  "frame-src 'self' https://discord.com https://*.discord.com",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// Static asset paths that benefit from long-lived caching (content-addressed or versioned).
// Note: .data is excluded — core archives are served from R2 with immutable headers directly.
const IMMUTABLE_ASSET_EXTENSIONS = ['.mp4', '.mp3', '.jpg', '.jpeg', '.png', '.webp', '.avif', '.woff2', '.woff'];

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
    } else if (
      url.pathname.startsWith(CORES_PATH_PREFIX) &&
      url.pathname.endsWith('.data') &&
      !url.pathname.slice(CORES_PATH_PREFIX.length).includes('/')
    ) {
      // Core archives are stored in the R2 bucket; serve them directly.
      const filename = url.pathname.slice(CORES_PATH_PREFIX.length);
      const r2Object = await env.UPLOADS.get(`${CORES_R2_PREFIX}${filename}`);
      if (r2Object === null) {
        upstreamResponse = new Response('Not Found', { status: 404 });
      } else {
        upstreamResponse = new Response(r2Object.body, {
          status: 200,
          headers: {
            'Content-Type': r2Object.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'ETag': r2Object.httpEtag,
          },
        });
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

    return applyEdgeSecurityHeaders(upstreamResponse, isSecureTransport, url.pathname);
  },
};
