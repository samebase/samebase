const PROVIDER_OAUTH_DEFAULT_RETURN_PATH = "/providers";

export function buildProviderOAuthDefaultReturnUrl(args: {
  configuredAppUrl: string | undefined;
  requestUrl: string;
}): string {
  const callbackUrl = new URL(args.requestUrl);
  const appBaseUrl = args.configuredAppUrl
    ? new URL(args.configuredAppUrl, callbackUrl.origin)
    : callbackUrl;
  return new URL(PROVIDER_OAUTH_DEFAULT_RETURN_PATH, appBaseUrl).toString();
}
