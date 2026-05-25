import { isProductionPublicHostname } from "@/lib/prodUiMode";

export type NoterRouteSurface = "local" | "preview" | "production";

export type NoterRouteAvailability = readonly NoterRouteSurface[];

type NoterRouteAvailabilityMatch = {
  staticData: {
    availableOn?: NoterRouteAvailability;
  };
};

const LOCAL_ROUTE_HOSTNAMES = ["localhost", "127.0.0.1", "0.0.0.0", "::1"] as const;

function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function readEnvNoterRouteSurface(): NoterRouteSurface | null {
  const surface = import.meta.env.VITE_NOTER_ROUTE_SURFACE;
  switch (surface) {
    case "local":
    case "preview":
    case "production":
      return surface;
    default:
      return null;
  }
}

export function isLocalRouteHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  return LOCAL_ROUTE_HOSTNAMES.some((localHostname) => localHostname === normalizedHostname);
}

export function resolveNoterRouteSurface(args: { hostname: string }): NoterRouteSurface {
  const envSurface = readEnvNoterRouteSurface();
  if (envSurface !== null) {
    return envSurface;
  }

  if (isLocalRouteHostname(args.hostname)) {
    return "local";
  }

  if (isProductionPublicHostname(args.hostname)) {
    return "production";
  }

  return "preview";
}

export function readBrowserNoterRouteSurface(): NoterRouteSurface {
  return readNoterRouteSurfaceForRouteGuard() ?? "production";
}

export function readNoterRouteSurfaceForRouteGuard(): NoterRouteSurface | null {
  const envSurface = readEnvNoterRouteSurface();
  if (envSurface !== null) {
    return envSurface;
  }

  if (typeof window !== "undefined") {
    return resolveNoterRouteSurface({ hostname: window.location.hostname });
  }

  return null;
}

export function readNoterRouteSurfaceForOrigin(origin: string): NoterRouteSurface {
  try {
    return resolveNoterRouteSurface({ hostname: new URL(origin).hostname });
  } catch {
    return "production";
  }
}

export function canAccessNoterRouteAvailability(
  availableOn: NoterRouteAvailability | undefined,
  surface: NoterRouteSurface,
): boolean {
  return (
    availableOn === undefined ||
    availableOn.some((availableSurface) => availableSurface === surface)
  );
}

/**
 * Parent route availability is restrictive: a child can only render when every
 * matched route that declares an availability policy allows the current surface.
 */
export function canAccessNoterRouteMatchesAvailability(
  matches: readonly NoterRouteAvailabilityMatch[],
  surface: NoterRouteSurface,
): boolean {
  return matches.every((match) =>
    canAccessNoterRouteAvailability(match.staticData.availableOn, surface),
  );
}
