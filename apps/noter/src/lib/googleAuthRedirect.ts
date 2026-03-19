import {
  buildPathWithUpdatedQuery,
  type PathWithSearch,
  setQueryParam,
} from "./queryParams";

export function buildCurrentGoogleRedirectTo(locationLike: PathWithSearch) {
  return buildPathWithUpdatedQuery(locationLike, (searchParams) => {
    setQueryParam(searchParams, "auth", false);
  });
}
