import { isProductionPublicHostname } from "@/lib/prodUiMode";

export type NoterRouteEnvironment = "local" | "preview" | "production";

export type NoterRouteAvailability = readonly NoterRouteEnvironment[];

type NoterRouteAvailabilityMatch = {
  staticData: {
    availableEnvironments?: NoterRouteAvailability;
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

function readEnvNoterRouteEnvironment(): NoterRouteEnvironment | null {
  const environment = import.meta.env.VITE_NOTER_ROUTE_ENVIRONMENT;
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

export function resolveNoterRouteEnvironment(args: { hostname: string }): NoterRouteEnvironment {
  const envEnvironment = readEnvNoterRouteEnvironment();
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

export function readBrowserNoterRouteEnvironment(): NoterRouteEnvironment {
  return readNoterRouteEnvironmentForRouteGuard() ?? "production";
}

export function readNoterRouteEnvironmentForRouteGuard(): NoterRouteEnvironment | null {
  const envEnvironment = readEnvNoterRouteEnvironment();
  if (envEnvironment !== null) {
    return envEnvironment;
  }

  if (typeof window !== "undefined") {
    return resolveNoterRouteEnvironment({ hostname: window.location.hostname });
  }

  return null;
}

export function readNoterRouteEnvironmentForOrigin(origin: string): NoterRouteEnvironment {
  try {
    return resolveNoterRouteEnvironment({ hostname: new URL(origin).hostname });
  } catch {
    return "production";
  }
}

export function canAccessNoterRouteAvailability(
  availableEnvironments: NoterRouteAvailability | undefined,
  routeEnvironment: NoterRouteEnvironment,
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
export function canAccessNoterRouteMatchesAvailability(
  matches: readonly NoterRouteAvailabilityMatch[],
  routeEnvironment: NoterRouteEnvironment,
): boolean {
  return matches.every((match) =>
    canAccessNoterRouteAvailability(match.staticData.availableEnvironments, routeEnvironment),
  );
}
