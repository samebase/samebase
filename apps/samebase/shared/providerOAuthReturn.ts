import { parseSiteOrigin } from "./siteOrigin";
import { removeAuthorizationSensitiveSearchParams } from "./authorizationError";

function isOrganizationProvidersPath(pathname: string, githubOwnerLogin: string): boolean {
  const pathSegments = pathname.split("/");
  if (
    pathSegments.length !== 4 ||
    pathSegments[0] !== "" ||
    pathSegments[1] !== "org" ||
    pathSegments[3] !== "providers"
  ) {
    return false;
  }
  try {
    return decodeURIComponent(pathSegments[2] ?? "").toLowerCase() === githubOwnerLogin;
  } catch {
    return false;
  }
}

export function buildProviderOAuthDefaultReturnUrl(args: {
  configuredAppUrl: string | undefined;
  githubOwnerLogin: string;
  requestUrl: string;
  returnToPath?: string;
}): string {
  const callbackUrl = new URL(args.requestUrl);
  const appBaseUrl = args.configuredAppUrl ? parseSiteOrigin(args.configuredAppUrl) : callbackUrl;
  const githubOwnerLogin = args.githubOwnerLogin.trim().toLowerCase();
  if (githubOwnerLogin.length === 0) {
    throw new Error("GitHub owner login is required.");
  }

  const defaultReturnUrl = new URL(
    `/org/${encodeURIComponent(githubOwnerLogin)}/providers`,
    appBaseUrl,
  );
  if (args.returnToPath === undefined) {
    return defaultReturnUrl.toString();
  }

  try {
    const requestedReturnUrl = new URL(args.returnToPath, appBaseUrl);
    if (
      requestedReturnUrl.origin === defaultReturnUrl.origin &&
      isOrganizationProvidersPath(requestedReturnUrl.pathname, githubOwnerLogin)
    ) {
      requestedReturnUrl.search = removeAuthorizationSensitiveSearchParams(
        requestedReturnUrl.search,
      );
      return requestedReturnUrl.toString();
    }
  } catch {
    // Use the canonical Providers page below.
  }
  return defaultReturnUrl.toString();
}
