import { parseSiteOrigin } from "./siteOrigin";

export const GITHUB_APP_SETUP_POPUP_NAME = "github-app-setup";

export function isSafeGitHubAppReturnToPath(returnToPath: string): boolean {
  return returnToPath.startsWith("/") && !returnToPath.startsWith("//");
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
