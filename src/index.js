const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth"];

const DOCUMENT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https://discord.com https://*.discord.com https://barrelrollcounter-worker.naimean.workers.dev https://whiteboard.cloud.microsoft https://app.smartsheet.com https://recoverycoa.service-now.com",
  "frame-src 'self' https://discord.com https://*.discord.com",
  "form-action 'self' https://app.smartsheet.com",
  "upgrade-insecure-requests",
].join('; ');

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function applyEdgeSecurityHeaders(response, isSecureTransport) {
  const headers = new Headers(response.headers);
  const contentType = (headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('text/html')) {
    headers.set('Content-Security-Policy', DOCUMENT_CSP);
  } else if (contentType.includes('application/json') || contentType.includes('text/plain')) {
    headers.set('Content-Security-Policy', API_CSP);
  }

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

    if (PROXY_PATHS.some((path) => url.pathname.startsWith(path))) {
      upstreamResponse = await env.COUNTER.fetch(request);
    } else {
      upstreamResponse = await env.ASSETS.fetch(request);
    }

    return applyEdgeSecurityHeaders(upstreamResponse, isSecureTransport);
  },
};
