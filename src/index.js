const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth"];
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://discord.com https://discordapp.com",
  "frame-src https://discord.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

function applySecurityHeaders(request, response) {
  const headers = new Headers(response.headers);
  const contentType = headers.get("Content-Type") || "";
  const isHtmlResponse = contentType.toLowerCase().includes("text/html");
  const protocol = new URL(request.url).protocol;

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  if (isHtmlResponse) {
    headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
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
    let response;

    if (PROXY_PATHS.some((path) => url.pathname.startsWith(path))) {
      response = await env.COUNTER.fetch(request);
    } else {
      response = await env.ASSETS.fetch(request);
    }

    return applySecurityHeaders(request, response);
  },
};
