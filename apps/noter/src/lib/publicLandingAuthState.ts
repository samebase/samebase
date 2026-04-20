import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { isProdUiModeEnabled } from "@/lib/prodUiMode";
import { type RootRouteSearch } from "@/lib/rootRouteSearch";
import { STATIC_PUBLIC_LANDING_PASSWORD_AUTH_MODE_ATTRIBUTE } from "@/lib/staticPublicLandingShared";
import type { PasswordAuthMode as PublicPasswordAuthMode } from "../../convex/deploymentProfile";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const AUTH_PROVIDER_KEY = "noter_auth_provider";
const PASSWORD_AUTH_MODE_KEY = "noter_public_landing_password_auth_mode";
export type PasswordAuthSurface = "hidden" | "local_worktree" | "preview";

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

function isStoredPasswordAuthMode(
  value: string | null,
): value is PublicPasswordAuthMode {
  return (
    value === "off" ||
    value === "local_worktree_seed" ||
    value === "preview_seed"
  );
}

function readStoredPasswordAuthMode(): PublicPasswordAuthMode | null {
  const storedValue = withLocalStorage(
    (storage) => storage.getItem(PASSWORD_AUTH_MODE_KEY),
    null,
  );
  return isStoredPasswordAuthMode(storedValue) ? storedValue : null;
}

function readStaticPasswordAuthModeFromRoot(): PublicPasswordAuthMode | null {
  if (typeof document === "undefined") {
    return null;
  }

  const rootValue =
    document
      .getElementById("root")
      ?.getAttribute(STATIC_PUBLIC_LANDING_PASSWORD_AUTH_MODE_ATTRIBUTE) ??
    null;
  return isStoredPasswordAuthMode(rootValue) ? rootValue : null;
}

export function rememberPublicLandingPasswordAuthMode(
  passwordAuthMode: PublicPasswordAuthMode,
): void {
  withLocalStorage((storage) => {
    storage.setItem(PASSWORD_AUTH_MODE_KEY, passwordAuthMode);
  }, undefined);
}

/**
 * Manual refreshes should preserve the same password-auth slot while the
 * public deployment-profile query reconnects, instead of re-centering the
 * landing card and then expanding it a frame later.
 */
export function resolvePublicLandingPasswordAuthMode(
  passwordAuthMode: PublicPasswordAuthMode | undefined,
): PublicPasswordAuthMode {
  return (
    passwordAuthMode ??
    readStoredPasswordAuthMode() ??
    readStaticPasswordAuthModeFromRoot() ??
    "off"
  );
}

function hasGoogleAuth(search: RootRouteSearch): boolean {
  return search.auth === "google";
}

function hasGoogleSignupReturn(search: RootRouteSearch): boolean {
  return search.signup === "google";
}

export function shouldRenderGoogleSignupClosedState(
  pathname: string,
  routeSearch: RootRouteSearch,
): boolean {
  return pathname === "/" && hasGoogleSignupReturn(routeSearch);
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

function shouldKeepPublicLandingForProdUi(
  pathname: string,
  routeSearch: RootRouteSearch,
): boolean {
  return (
    pathname === "/" &&
    isProdUiModeEnabled(routeSearch) &&
    !hasGoogleAuth(routeSearch) &&
    !hasGoogleSignupReturn(routeSearch)
  );
}

export function shouldRenderPublicLandingWithoutAuthGate(
  pathname: string,
  routeSearch: RootRouteSearch,
): boolean {
  if (shouldRenderGoogleSignupClosedState(pathname, routeSearch)) {
    return true;
  }
  if (shouldKeepPublicLandingForProdUi(pathname, routeSearch)) {
    return true;
  }
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
  if (shouldRenderGoogleSignupClosedState(pathname, routeSearch)) {
    return false;
  }
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

/**
 * `?prod-ui` intentionally hides the password controls even on deployments
 * that support them so the landing page can mirror the production shell.
 */
export function getVisiblePasswordAuthSurface(args: {
  passwordAuthMode: PublicPasswordAuthMode;
  prodUiModeEnabled: boolean;
}): PasswordAuthSurface {
  if (args.prodUiModeEnabled) {
    return "hidden";
  }
  return getPasswordAuthSurface(args.passwordAuthMode);
}
