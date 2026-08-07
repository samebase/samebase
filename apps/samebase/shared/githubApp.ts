import { parseSiteOrigin } from "./siteOrigin";

export const GITHUB_APP_SETUP_POPUP_NAME = "github-app-setup";
const GITHUB_APP_RETURN_TO_BASE_ORIGIN = "https://samebase.local";

export function isSafeGitHubAppReturnToPath(returnToPath: string): boolean {
  const trimmed = returnToPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return false;
  }
  try {
    return (
      new URL(trimmed, GITHUB_APP_RETURN_TO_BASE_ORIGIN).origin === GITHUB_APP_RETURN_TO_BASE_ORIGIN
    );
  } catch {
    return false;
  }
}

export function buildGitHubOrganizationSettingsReturnUrl(args: {
  githubOwnerLogin: string;
  previousReturnUrl: string;
}): string {
  const previousReturnUrl = new URL(args.previousReturnUrl);
  const returnUrl = new URL(
    `/org/${encodeURIComponent(args.githubOwnerLogin.trim().toLowerCase())}/settings`,
    previousReturnUrl,
  );
  returnUrl.search = previousReturnUrl.search;
  returnUrl.hash = previousReturnUrl.hash;
  return returnUrl.toString();
}

export function buildGitHubAppInstallationUrl(args: { appSlug: string; state: string }): string {
  const url = new URL(
    `https://github.com/apps/${encodeURIComponent(args.appSlug)}/installations/new`,
  );
  url.searchParams.set("state", args.state);
  return url.toString();
}

export function buildGitHubUserAuthorizationUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  return url.toString();
}

export function buildGitHubAppSetupReturnUrl(args: {
  configuredAppUrl: string | undefined;
  requestUrl: string;
  returnToPath: string | undefined;
}): string {
  const callbackUrl = new URL(args.requestUrl);
  const appBaseUrl = args.configuredAppUrl ? parseSiteOrigin(args.configuredAppUrl) : callbackUrl;
  const returnToPath =
    args.returnToPath !== undefined && isSafeGitHubAppReturnToPath(args.returnToPath)
      ? args.returnToPath
      : "/";
  return new URL(returnToPath, appBaseUrl).toString();
}
