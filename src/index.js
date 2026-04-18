const COUNTER_WORKER_URL = "https://barrelrollcounter-worker.naimean.workers.dev";

const PROXY_PATHS = ["/get", "/increment", "/board", "/board-upload", "/board-delete", "/uploads/"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Proxy counter-related paths to the barrelrollcounter-worker
    if (PROXY_PATHS.some(p => url.pathname.startsWith(p))) {
      const proxyUrl = new URL(request.url);
      proxyUrl.hostname = "barrelrollcounter-worker.naimean.workers.dev";
      const proxyRequest = new Request(proxyUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "manual",
      });
      return fetch(proxyRequest);
    }

    // Otherwise, serve static assets
    return env.ASSETS.fetch(request);
  },
};
