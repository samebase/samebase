const LOCAL_VISUAL_FIXTURE_HOSTNAMES = ["localhost", "127.0.0.1", "0.0.0.0", "::1"] as const;

function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

/**
 * /visual-fixture is a local-only test surface; deployed production and preview
 * hosts should behave as if the route does not exist.
 */
export function isVisualFixtureRouteAvailableOnHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  return LOCAL_VISUAL_FIXTURE_HOSTNAMES.some(
    (localHostname) => localHostname === normalizedHostname,
  );
}
