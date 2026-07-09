function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

export function parseSiteOrigin(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("SITE_URL must be an absolute URL.");
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error("SITE_URL must not include credentials.");
  }

  const isLoopbackHttp = url.protocol === "http:" && isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error("SITE_URL must use https, except for loopback local development URLs.");
  }

  if (url.pathname !== "/" || url.search.length > 0 || url.hash.length > 0) {
    throw new Error("SITE_URL must be an origin without a path, query, or fragment.");
  }

  return url;
}
