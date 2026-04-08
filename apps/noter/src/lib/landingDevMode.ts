import {
  buildPathWithUpdatedQuery,
  cloneQueryParams,
  type PathWithSearch,
  setQueryParam,
} from "./queryParams";

export const LANDING_DEV_MODE_QUERY_PARAM = "dev";
export const LANDING_DEV_MODE_TOGGLE_LABEL = "/?dev";

type SearchFlagReader = URLSearchParams | Readonly<Record<string, unknown>>;

function hasSearchFlag(search: SearchFlagReader, key: string): boolean {
  if (search instanceof URLSearchParams) {
    return search.has(key);
  }

  const value = search[key];
  return value === true || value === "" || value === "true";
}

export function isLandingDevModeEnabled(search: SearchFlagReader): boolean {
  return hasSearchFlag(search, LANDING_DEV_MODE_QUERY_PARAM);
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

export function getLandingDevToggleLabel(search: SearchFlagReader): string {
  return isLandingDevModeEnabled(search) ? "/" : LANDING_DEV_MODE_TOGGLE_LABEL;
}
