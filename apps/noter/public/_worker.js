export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return env.ASSETS.fetch(request);
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const shouldServeStaticAsset =
      pathname === "/" ||
      pathname === "/privacy" ||
      pathname === "/privacy/" ||
      pathname === "/terms" ||
      pathname === "/terms/" ||
      pathname === "/__spa-fallback" ||
      pathname === "/__spa-fallback.html" ||
      pathname.startsWith("/assets/") ||
      pathname.includes(".");

    if (shouldServeStaticAsset) {
      return env.ASSETS.fetch(request);
    }

    // Keep prerendered entrypoints on their real HTML documents and only route
    // extensionless unknown paths through the SPA fallback shell.
    const fallbackUrl = new URL(request.url);
    fallbackUrl.pathname = "/__spa-fallback";

    return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));
  },
};
