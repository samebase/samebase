import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { type RootRouteSearch } from "@/lib/rootRouteSearch";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const AUTH_PROVIDER_KEY = "noter_auth_provider";
export type PasswordAuthSurface = "hidden" | "local_worktree" | "preview";
export type PublicPasswordAuthMode =
  | "off"
  | "local_worktree_seed"
  | "preview_seed";

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

function isKnownUnauthenticatedLandingVisit(
  pathname: string,
  routeSearch: RootRouteSearch,
): boolean {
  return (
    pathname === "/" &&
    !hasGoogleAuth(routeSearch) &&
    readAuthFlagValue() !== "1" &&
    readAuthProviderValue() === null
  );
}

export function shouldRenderPublicLandingWithoutAuthGate(
  pathname: string,
  routeSearch: RootRouteSearch,
): boolean {
  return isKnownUnauthenticatedLandingVisit(pathname, routeSearch);
}

/**
 * Keep the anonymous landing auth slot stable while hiding Google auth unless
 * the operator explicitly enables the `?dev` variant from the status bar.
 */
export function shouldShowGoogleAuthForPathname(
  pathname: string,
  routeSearch: RootRouteSearch,
): boolean {
  return (
    !shouldRenderPublicLandingWithoutAuthGate(pathname, routeSearch) ||
    isLandingDevModeEnabled(routeSearch)
  );
}

export function getPasswordAuthSurface(
  passwordAuthMode: PublicPasswordAuthMode,
): PasswordAuthSurface {
  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return "local_worktree";
    case "preview_seed":
      return "preview";
    case "off":
      return "hidden";
    default:
      passwordAuthMode satisfies never;
      return "hidden";
  }
}
