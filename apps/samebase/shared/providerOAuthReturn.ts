import { parseSiteOrigin } from "./siteOrigin";

export function buildProviderOAuthDefaultReturnUrl(args: {
  configuredAppUrl: string | undefined;
  githubOwnerLogin: string;
  requestUrl: string;
}): string {
  const callbackUrl = new URL(args.requestUrl);
  const appBaseUrl = args.configuredAppUrl ? parseSiteOrigin(args.configuredAppUrl) : callbackUrl;
  const githubOwnerLogin = args.githubOwnerLogin.trim().toLowerCase();
  if (githubOwnerLogin.length === 0) {
    throw new Error("GitHub owner login is required.");
  }

  return new URL(`/org/${encodeURIComponent(githubOwnerLogin)}/providers`, appBaseUrl).toString();
}
