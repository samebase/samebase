import { parseSiteOrigin } from "./siteOrigin";

const PROVIDER_OAUTH_DEFAULT_RETURN_PATH = "/providers";
const PROVIDER_OAUTH_RETURN_PATH_VALIDATION_ORIGIN = "https://samebase.local";

export function isSafeProviderOAuthReturnToPath(returnToPath: string): boolean {
  if (!returnToPath.startsWith("/") || returnToPath.startsWith("//")) {
    return false;
  }

  try {
    return (
      new URL(returnToPath, PROVIDER_OAUTH_RETURN_PATH_VALIDATION_ORIGIN).origin ===
      PROVIDER_OAUTH_RETURN_PATH_VALIDATION_ORIGIN
    );
  } catch {
    return false;
  }
}

export function buildProviderOAuthDefaultReturnUrl(args: {
  configuredAppUrl: string | undefined;
  requestUrl: string;
}): string {
  const callbackUrl = new URL(args.requestUrl);
  const appBaseUrl = args.configuredAppUrl ? parseSiteOrigin(args.configuredAppUrl) : callbackUrl;
  return new URL(PROVIDER_OAUTH_DEFAULT_RETURN_PATH, appBaseUrl).toString();
}

export function buildProviderOAuthReturnUrl(args: {
  configuredAppUrl: string | undefined;
  requestUrl: string;
  returnToPath: string;
}): string {
  const defaultReturnUrl = buildProviderOAuthDefaultReturnUrl(args);
  if (!isSafeProviderOAuthReturnToPath(args.returnToPath)) {
    return defaultReturnUrl;
  }
  return new URL(args.returnToPath, defaultReturnUrl).toString();
}
