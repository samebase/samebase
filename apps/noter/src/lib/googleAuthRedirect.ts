import { buildPathWithUpdatedQuery, setQueryParam } from "./queryParams";

export function buildCurrentGoogleRedirectTo(
  pathname: string,
  search: string | URLSearchParams | undefined,
  hash?: string,
) {
  return buildPathWithUpdatedQuery(
    { pathname, search, hash },
    (searchParams) => {
      setQueryParam(searchParams, "auth", false);
    },
  );
}
