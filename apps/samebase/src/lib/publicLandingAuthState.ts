import { type RootRouteSearch } from "@/routeSearch/root";
import type { PasswordAuthMode as PublicPasswordAuthMode } from "../../convex/deploymentProfile";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";
import { isOrganizationInvitationPath } from "@/organization/organizationInvitationRoute";
import { readAuthorizationError } from "@/routeSearch/authorizationError";

export type PasswordAuthSurface = "hidden" | "local_worktree" | "sign_in";

/**
The generic notice covers a marked OAuth return without a session. A recognized authorization error
in the URL, or a sign-in that Samebase rejected with a message, shows its own guidance instead.
*/
export function shouldRenderOAuthReturnNotice(
  pathname: string,
  routeSearch: RootRouteSearch,
  signInRejected: boolean,
): boolean {
  return (
    pathname !== MCP_CONSENT_APP_PATH &&
    !isOrganizationInvitationPath(pathname) &&
    routeSearch.signup !== undefined &&
    readAuthorizationError(routeSearch) === null &&
    !signInRejected
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
