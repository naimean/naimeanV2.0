const PROXY_PATHS = ["/get", "/increment", "/board", "/board-upload", "/board-delete", "/uploads/"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Proxy counter-related paths to barrelrollcounter-worker
    if (PROXY_PATHS.some(p => url.pathname.startsWith(p))) {
      const proxyUrl = new URL(url.pathname + url.search, `https://barrelrollcounter-worker.naimean.workers.dev`);
      return fetch(new Request(proxyUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "manual",
      }));
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
};
