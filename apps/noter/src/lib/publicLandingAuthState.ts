import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import type { PathWithSearch } from "@/lib/queryParams";

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

function isKnownUnauthenticatedLandingVisit(location: PathWithSearch): boolean {
  const searchParams = new URLSearchParams(location.search);
  return (
    location.pathname === "/" &&
    !searchParams.has("auth") &&
    readAuthFlagValue() !== "1" &&
    !hasStoredConvexAuthTokens()
  );
}

export function shouldRenderFastLandingShell(
  location: PathWithSearch,
): boolean {
  const searchParams = new URLSearchParams(location.search);
  return (
    isKnownUnauthenticatedLandingVisit(location) &&
    !isLandingDevModeEnabled(searchParams)
  );
}

export function shouldRenderPublicLandingWithoutAuthGate(
  location: PathWithSearch,
): boolean {
  return isKnownUnauthenticatedLandingVisit(location);
}

/**
 * Hide Google auth on the anonymous landing surface unless the operator has
 * explicitly enabled the `?dev` variant from the status bar.
 */
export function shouldShowGoogleAuthForLocation(
  location: PathWithSearch,
): boolean {
  const searchParams = new URLSearchParams(location.search);
  return (
    !shouldRenderPublicLandingWithoutAuthGate(location) ||
    isLandingDevModeEnabled(searchParams)
  );
}
