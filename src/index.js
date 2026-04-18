// Paths ending with "/" are prefix matches; all others are exact matches.
const PROXY_PATHS = ["/get", "/increment", "/board", "/board-upload", "/board-delete", "/uploads/"];

function shouldProxyPath(pathname) {
  return PROXY_PATHS.some((path) => (
    path.endsWith("/") ? pathname.startsWith(path) : pathname === path
  ));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Proxy counter-related paths to barrelrollcounter-worker
    if (shouldProxyPath(url.pathname)) {
      const proxyUrl = new URL(url.pathname + url.search, `https://barrelrollcounter-worker.naimean.workers.dev`);
      return fetch(new Request(proxyUrl, request), { redirect: "manual" });
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
};
