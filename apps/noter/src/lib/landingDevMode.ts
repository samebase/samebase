import {
  buildPathWithUpdatedQuery,
  cloneQueryParams,
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
  pathname: string,
  search: string | URLSearchParams | undefined,
  hash: string | undefined,
  enabled: boolean,
): string {
  return buildPathWithUpdatedQuery(
    { pathname, search, hash },
    (searchParams) => {
      setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, enabled);
    },
  );
}

export function buildLandingDevToggleHref(
  pathname: string,
  search: string | URLSearchParams | undefined,
  hash: string | undefined,
): string {
  const currentSearchParams = cloneQueryParams(search);
  return buildLandingDevModeHref(
    pathname,
    search,
    hash,
    !isLandingDevModeEnabled(currentSearchParams),
  );
}

export function getLandingDevToggleLabel(search: SearchFlagReader): string {
  return isLandingDevModeEnabled(search) ? "/" : LANDING_DEV_MODE_TOGGLE_LABEL;
}
