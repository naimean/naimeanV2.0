const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth", "/go", "/layout"];

const UPLOADS_HOSTNAME = 'uploads.naimean.com';

const DOCUMENT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.emulatorjs.org",
  // 'wasm-unsafe-eval' is required for EmulatorJS to compile WebAssembly cores at runtime.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://discord.com https://*.discord.com https://*.workers.dev https://cdn.emulatorjs.org",
  "worker-src blob:",
  "frame-src 'self' https://discord.com https://*.discord.com",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// Static asset paths that benefit from long-lived caching (content-addressed or versioned).
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
