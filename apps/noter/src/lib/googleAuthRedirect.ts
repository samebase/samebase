import { buildPathWithUpdatedQuery, setQueryParam } from "./queryParams";

type GoogleRedirectOptions = {
  markPublicSignupReturn?: boolean;
};

export function buildCurrentGoogleRedirectTo(
  pathname: string,
  search: string | URLSearchParams | undefined,
  hash?: string,
  options: GoogleRedirectOptions = {},
) {
  return buildPathWithUpdatedQuery(
    { pathname, search, hash },
    (searchParams) => {
      setQueryParam(searchParams, "auth", false);
      // Only cold public landing signup attempts should preserve the
      // unauthenticated return marker.
      setQueryParam(
        searchParams,
        "signup",
        options.markPublicSignupReturn ? "google" : false,
      );
    },
  );
}
