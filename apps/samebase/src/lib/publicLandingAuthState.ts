import { guard } from "@samebase/dependent";
import { PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY } from "@/lib/authStorageKeys";
import { type RootRouteSearch } from "@/routeSearch/root";
import type { PasswordAuthMode as PublicPasswordAuthMode } from "../../convex/deploymentProfile";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";
import { isOrganizationInvitationPath } from "@/lib/organizationInvitationRoute";
import { readAuthorizationError } from "@/routeSearch/authorizationError";

export type PasswordAuthSurface = "hidden" | "local_worktree" | "sign_in";

function withLocalStorage<T>(reader: (storage: Storage) => T, fallback: T): T {
  try {
    return reader(window.localStorage);
  } catch {
    return fallback;
  }
}

const isStoredPasswordAuthMode = guard<string | null, PublicPasswordAuthMode>((value) =>
  value === "off" ||
  value === "local_worktree_seed" ||
  value === "preview_seed" ||
  value === "manual"
    ? value
    : null,
);

function readStoredPasswordAuthMode(): PublicPasswordAuthMode | null {
  const storedValue = withLocalStorage(
    (storage) => storage.getItem(PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY),
    null,
  );
  return isStoredPasswordAuthMode(storedValue) ? storedValue : null;
}

export function rememberPublicLandingPasswordAuthMode(
  passwordAuthMode: PublicPasswordAuthMode,
): void {
  withLocalStorage((storage) => {
    storage.setItem(PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY, passwordAuthMode);
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
  return passwordAuthMode ?? readStoredPasswordAuthMode() ?? "off";
}

export function shouldRenderOAuthSignupClosedState(
  pathname: string,
  routeSearch: RootRouteSearch,
): boolean {
  return (
    pathname !== MCP_CONSENT_APP_PATH &&
    !isOrganizationInvitationPath(pathname) &&
    routeSearch.signup !== undefined &&
    readAuthorizationError(routeSearch) === null
  );
}

export function getPasswordAuthSurface(
  passwordAuthMode: PublicPasswordAuthMode,
): PasswordAuthSurface {
  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return "local_worktree";
    case "preview_seed":
    case "manual":
      return "sign_in";
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
  if (args.prodUiModeEnabled && args.passwordAuthMode !== "manual") {
    return "hidden";
  }
  return getPasswordAuthSurface(args.passwordAuthMode);
}
