import { type RootRouteSearch } from "@/routeSearch/root";

type GoogleRedirectOptions = {
  authReturn?: "dashboard";
  markPublicSignupReturn?: boolean;
};

/**
 * Preserve route-owned search params while clearing the one-shot Google auth
 * trigger before handing Convex Auth its post-login redirect URL.
 */
export function buildGoogleRedirectSearch<TSearch extends RootRouteSearch>(
  search: TSearch,
  options: GoogleRedirectOptions = {},
) {
  return {
    ...search,
    auth: undefined,
    "auth-return": options.authReturn,
    // Preserve the marker so a signed-out return can explain that signup is closed.
    signup: options.markPublicSignupReturn ? "google" : undefined,
  };
}

export function buildGoogleAuthPopupSearch<TSearch extends RootRouteSearch>(
  search: TSearch,
  auth: NonNullable<RootRouteSearch["auth"]>,
  options: GoogleRedirectOptions = {},
) {
  return {
    ...search,
    auth,
    "auth-return": options.authReturn,
    // Keep iframe-based Google auth aligned with the top-level button.
    signup: options.markPublicSignupReturn ? "google" : undefined,
  };
}
