import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import type { PathWithSearch } from "@/lib/queryParams";
import {
  readRootRouteSearchFromLocation,
  type RootRouteSearch,
} from "@/lib/rootRouteSearch";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const AUTH_PROVIDER_KEY = "noter_auth_provider";

function withLocalStorage<T>(reader: (storage: Storage) => T, fallback: T): T {
  try {
    return reader(window.localStorage);
  } catch {
    return fallback;
  }
}

function readAuthFlagValue(): string | null {
  return withLocalStorage((storage) => storage.getItem(AUTH_FLAG_KEY), null);
}

function readAuthProviderValue(): string | null {
  return withLocalStorage(
    (storage) => storage.getItem(AUTH_PROVIDER_KEY),
    null,
  );
}

function hasGoogleAuth(search: RootRouteSearch): boolean {
  return search.auth === "google";
}

function resolveRootRouteSearch(
  location: PathWithSearch,
  routeSearch?: RootRouteSearch,
): RootRouteSearch {
  return routeSearch ?? readRootRouteSearchFromLocation(location);
}

function isKnownUnauthenticatedLandingVisit(
  location: PathWithSearch,
  routeSearch?: RootRouteSearch,
): boolean {
  const rootRouteSearch = resolveRootRouteSearch(location, routeSearch);
  return (
    location.pathname === "/" &&
    !hasGoogleAuth(rootRouteSearch) &&
    readAuthFlagValue() !== "1" &&
    readAuthProviderValue() === null
  );
}

export function shouldRenderFastLandingShell(
  location: PathWithSearch,
  routeSearch?: RootRouteSearch,
): boolean {
  const rootRouteSearch = resolveRootRouteSearch(location, routeSearch);
  return (
    isKnownUnauthenticatedLandingVisit(location, rootRouteSearch) &&
    !isLandingDevModeEnabled(rootRouteSearch)
  );
}

export function shouldRenderPublicLandingWithoutAuthGate(
  location: PathWithSearch,
  routeSearch?: RootRouteSearch,
): boolean {
  return isKnownUnauthenticatedLandingVisit(location, routeSearch);
}

/**
 * Hide Google auth on the anonymous landing surface unless the operator has
 * explicitly enabled the `?dev` variant from the status bar.
 */
export function shouldShowGoogleAuthForLocation(
  location: PathWithSearch,
  routeSearch?: RootRouteSearch,
): boolean {
  const rootRouteSearch = resolveRootRouteSearch(location, routeSearch);
  return (
    !shouldRenderPublicLandingWithoutAuthGate(location, rootRouteSearch) ||
    isLandingDevModeEnabled(rootRouteSearch)
  );
}
