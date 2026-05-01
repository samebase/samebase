import { type RootRouteSearch } from "./rootRouteSearch";

type GoogleRedirectOptions = {
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
    // Keep iframe-based Google auth aligned with the top-level button so failed
    // public signup returns land on the same waitlist state.
    signup: options.markPublicSignupReturn ? "google" : undefined,
  };
}
