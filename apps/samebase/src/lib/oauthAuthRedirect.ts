import { type RootRouteSearch } from "@/routeSearch/root";

export type OAuthAuthProvider = NonNullable<RootRouteSearch["auth"]>;

type OAuthRedirectOptions = {
  authReturn?: "dashboard";
  markPublicSignupReturn?: boolean;
};

/** Preserve route search while clearing the one-use OAuth trigger. */
export function buildOAuthRedirectSearch<TSearch extends RootRouteSearch>(
  search: TSearch,
  provider: OAuthAuthProvider,
  options: OAuthRedirectOptions = {},
) {
  return {
    ...search,
    auth: undefined,
    "auth-return": options.authReturn,
    signup: options.markPublicSignupReturn ? provider : undefined,
  };
}
