const PROXY_PATHS = [
  "/get",
  "/hit",
  "/increment",
  "/board",
  "/board-upload",
  "/board-delete",
];

function isProxyPath(pathname) {
  if (PROXY_PATHS.some((path) => pathname.startsWith(path))) {
    return true;
  }

  return pathname === "/uploads" || pathname.startsWith("/uploads/");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isProxyPath(url.pathname)) {
      return env.COUNTER.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
