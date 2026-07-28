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
    // Only cold public landing signup attempts should preserve the
    // unauthenticated return marker.
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
    // Keep iframe-based Google auth aligned with the top-level button so failed
    // public signup returns land on the same pending access state.
    signup: options.markPublicSignupReturn ? "google" : undefined,
  };
}
