import { includes } from "@samebase/dependent/main";

import { parseSiteOrigin } from "./siteOrigin";
import {
  removeAuthorizationSensitiveSearchParams,
  type AuthorizationProvider,
} from "./authorizationError";
import { createUrlSearchParams, readUrlSearchParamsRecord } from "./urlSearchParams";

export const PROVIDER_OAUTH_COMPLETION_ROUTE = "/oauth/provider-complete";

const PROVIDER_OAUTH_COMPLETION_PROVIDERS = ["convex", "cloudflare", "cloudflare_mcp"] as const;
type ProviderOAuthCompletionProvider = (typeof PROVIDER_OAUTH_COMPLETION_PROVIDERS)[number];

/**
The provider authorization that a provider OAuth callback hands to the app
completion page. It travels only in the URL fragment, so browsers do not send
it to the app Worker, request logs, or referrers.
*/
export type ProviderOAuthCompletion = {
  provider: ProviderOAuthCompletionProvider;
  state: string;
  code: string;
};

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

/**
The app origin that provider OAuth returns to: the configured app URL, or the
origin that served the provider callback when no app URL is configured.
*/
export function readProviderOAuthAppOrigin(args: {
  configuredAppUrl: string | undefined;
  requestUrl: string;
}): URL {
  return args.configuredAppUrl
    ? parseSiteOrigin(args.configuredAppUrl)
    : new URL("/", args.requestUrl);
}

export function readProviderOAuthAuthorizationProvider(
  provider: ProviderOAuthCompletionProvider,
): Extract<AuthorizationProvider, "convex" | "cloudflare"> {
  switch (provider) {
    case "convex":
      return "convex";
    case "cloudflare":
    case "cloudflare_mcp":
      return "cloudflare";
    default:
      provider satisfies never;
      throw new Error("Unsupported OAuth provider.");
  }
}

export function buildProviderOAuthDefaultReturnUrl(args: {
  appOrigin: URL;
  githubOwnerLogin: string;
  returnToPath?: string;
}): string {
  const githubOwnerLogin = args.githubOwnerLogin.trim().toLowerCase();
  if (githubOwnerLogin.length === 0) {
    throw new Error("GitHub owner login is required.");
  }

  const defaultReturnUrl = new URL(
    `/org/${encodeURIComponent(githubOwnerLogin)}/providers`,
    args.appOrigin,
  );
  if (args.returnToPath === undefined) {
    return defaultReturnUrl.toString();
  }

  try {
    const requestedReturnUrl = new URL(args.returnToPath, args.appOrigin);
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

export function buildProviderOAuthCompletionUrl(args: {
  appOrigin: URL;
  completion: ProviderOAuthCompletion;
}): string {
  const completionUrl = new URL(PROVIDER_OAUTH_COMPLETION_ROUTE, args.appOrigin);
  completionUrl.hash = createUrlSearchParams({
    provider: args.completion.provider,
    state: args.completion.state,
    code: args.completion.code,
  }).toString();
  return completionUrl.toString();
}

export function readProviderOAuthCompletionFragment(hash: string): ProviderOAuthCompletion | null {
  const fragment = readUrlSearchParamsRecord(hash.startsWith("#") ? hash.slice(1) : hash);
  const provider = fragment["provider"];
  const state = fragment["state"];
  const code = fragment["code"];
  if (
    !includes(PROVIDER_OAUTH_COMPLETION_PROVIDERS, provider) ||
    typeof state !== "string" ||
    state.length === 0 ||
    typeof code !== "string" ||
    code.length === 0
  ) {
    return null;
  }
  return { provider, state, code };
}

export function isProviderOAuthCompletionPath(pathname: string): boolean {
  return (
    pathname === PROVIDER_OAUTH_COMPLETION_ROUTE ||
    pathname === `${PROVIDER_OAUTH_COMPLETION_ROUTE}/`
  );
}
