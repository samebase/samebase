import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import type { PathWithSearch } from "@/lib/queryParams";
import {
  readRootRouteSearchFromLocation,
  type RootRouteSearch,
} from "@/lib/rootRouteSearch";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const CONVEX_AUTH_STORAGE_KEY_PREFIX = "__convexAuth";

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

function hasStoredConvexAuthTokens(): boolean {
  return withLocalStorage((storage) => {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);
      if (
        storageKey !== null &&
        storageKey.startsWith(CONVEX_AUTH_STORAGE_KEY_PREFIX)
      ) {
        return true;
      }
    }

    return false;
  }, false);
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
    !hasStoredConvexAuthTokens()
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
