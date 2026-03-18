import {
  buildPathWithUpdatedQuery,
  cloneQueryParams,
  type PathWithSearch,
  setQueryParam,
} from "./queryParams";

export const LANDING_DEV_MODE_QUERY_PARAM = "dev";
export const LANDING_DEV_MODE_TOGGLE_LABEL = "/?dev";

export function isLandingDevModeEnabled(
  searchParams: URLSearchParams,
): boolean {
  return searchParams.has(LANDING_DEV_MODE_QUERY_PARAM);
}

export function buildLandingDevModeHref(
  location: PathWithSearch,
  enabled: boolean,
): string {
  return buildPathWithUpdatedQuery(location, (searchParams) => {
    setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, enabled);
  });
}

export function buildLandingDevToggleHref(location: PathWithSearch): string {
  const currentSearchParams = cloneQueryParams(location.search);
  return buildLandingDevModeHref(
    location,
    !isLandingDevModeEnabled(currentSearchParams),
  );
}

export function getLandingDevToggleLabel(
  searchParams: URLSearchParams,
): string {
  return isLandingDevModeEnabled(searchParams)
    ? "/"
    : LANDING_DEV_MODE_TOGGLE_LABEL;
}
