import { isProductionPublicHostname } from "@/lib/prodUiMode";

export type SamebaseRouteEnvironment = "local" | "preview" | "production";

export type SamebaseRouteAvailability = readonly SamebaseRouteEnvironment[];

type SamebaseRouteAvailabilityMatch = {
  staticData: {
    availableEnvironments?: SamebaseRouteAvailability;
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

function readEnvSamebaseRouteEnvironment(): SamebaseRouteEnvironment | null {
  const environment = import.meta.env.VITE_SAMEBASE_ROUTE_ENVIRONMENT;
  switch (environment) {
    case "local":
    case "preview":
    case "production":
      return environment;
    default:
      return null;
  }
}

export function isLocalRouteHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  return LOCAL_ROUTE_HOSTNAMES.some((localHostname) => localHostname === normalizedHostname);
}

export function resolveSamebaseRouteEnvironment(args: {
  hostname: string;
}): SamebaseRouteEnvironment {
  const envEnvironment = readEnvSamebaseRouteEnvironment();
  if (envEnvironment !== null) {
    return envEnvironment;
  }

  if (isLocalRouteHostname(args.hostname)) {
    return "local";
  }

  if (isProductionPublicHostname(args.hostname)) {
    return "production";
  }

  return "preview";
}

export function readBrowserSamebaseRouteEnvironment(): SamebaseRouteEnvironment {
  return readSamebaseRouteEnvironmentForRouteGuard() ?? "production";
}

export function readSamebaseRouteEnvironmentForRouteGuard(): SamebaseRouteEnvironment | null {
  const envEnvironment = readEnvSamebaseRouteEnvironment();
  if (envEnvironment !== null) {
    return envEnvironment;
  }

  if (typeof window !== "undefined") {
    return resolveSamebaseRouteEnvironment({ hostname: window.location.hostname });
  }

  return null;
}

export function readSamebaseRouteEnvironmentForOrigin(origin: string): SamebaseRouteEnvironment {
  try {
    return resolveSamebaseRouteEnvironment({ hostname: new URL(origin).hostname });
  } catch {
    return "production";
  }
}

export function canAccessSamebaseRouteAvailability(
  availableEnvironments: SamebaseRouteAvailability | undefined,
  routeEnvironment: SamebaseRouteEnvironment,
): boolean {
  return (
    availableEnvironments === undefined ||
    availableEnvironments.some((availableEnvironment) => availableEnvironment === routeEnvironment)
  );
}

/**
 * Parent route availability is restrictive: a child can only render when every
 * matched route that declares an availability policy allows the current environment.
 */
export function canAccessSamebaseRouteMatchesAvailability(
  matches: readonly SamebaseRouteAvailabilityMatch[],
  routeEnvironment: SamebaseRouteEnvironment,
): boolean {
  return matches.every((match) =>
    canAccessSamebaseRouteAvailability(match.staticData.availableEnvironments, routeEnvironment),
  );
}
