const PROXY_PATHS = ["/get", "/increment", "/board", "/board-upload", "/board-delete", "/uploads/"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (PROXY_PATHS.some((path) => url.pathname.startsWith(path))) {
      return env.COUNTER.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
