import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { isProductionPublicHostname } from "@/lib/prodUiMode";

export type RouteEnvironment = "local" | "preview" | "production";

export type RouteAvailability = readonly RouteEnvironment[];

type RouteAvailabilityMatch = {
  staticData: {
    availableEnvironments?: RouteAvailability;
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

function readEnvRouteEnvironment(): RouteEnvironment | null {
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

export function resolveRouteEnvironment(args: { hostname: string }): RouteEnvironment {
  const envEnvironment = readEnvRouteEnvironment();
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

/**
The environment of this render: the build's `VITE_SAMEBASE_ROUTE_ENVIRONMENT`, else the host of the
request on the server and of the page in the browser, so both renders agree.
*/
export function readRouteEnvironment(): RouteEnvironment {
  return readEnvRouteEnvironment() ?? readRouteEnvironmentForOrigin(readIsomorphicOrigin());
}

export function readRouteEnvironmentForOrigin(origin: string): RouteEnvironment {
  try {
    return resolveRouteEnvironment({ hostname: new URL(origin).hostname });
  } catch {
    return "production";
  }
}

export function canAccessRouteAvailability(
  availableEnvironments: RouteAvailability | undefined,
  routeEnvironment: RouteEnvironment,
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
export function canAccessRouteMatchesAvailability(
  matches: readonly RouteAvailabilityMatch[],
  routeEnvironment: RouteEnvironment,
): boolean {
  return matches.every((match) =>
    canAccessRouteAvailability(match.staticData.availableEnvironments, routeEnvironment),
  );
}
