const COUNTER_WORKER_URL = "https://barrelrollcounter-worker.naimean.workers.dev";

const PROXY_PATHS = ["/get", "/increment", "/hit", "/board", "/board-upload", "/board-delete", "/uploads/"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Proxy counter-related paths to the barrelrollcounter-worker
    if (PROXY_PATHS.some(p => url.pathname.startsWith(p))) {
      const proxyUrl = new URL(`${url.pathname}${url.search}`, COUNTER_WORKER_URL);
      const method = request.method.toUpperCase();
      const methodsWithBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);
      const body = methodsWithBody.has(method) ? request.clone().body : undefined;
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.delete("connection");
      headers.delete("transfer-encoding");
      const proxyRequest = new Request(proxyUrl.toString(), {
        method: request.method,
        headers,
        body,
        redirect: "manual",
      });
      return fetch(proxyRequest);
    }

    // Otherwise, serve static assets
    return env.ASSETS.fetch(request);
  },
};
