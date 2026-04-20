const PROXY_PATHS = ["/get", "/hit", "/increment", "/auth"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (PROXY_PATHS.some((path) => url.pathname.startsWith(path))) {
      return env.COUNTER.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
