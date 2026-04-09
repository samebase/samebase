import { type RootRouteSearch } from "./rootRouteSearch";

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

export function buildLandingDevModeSearch(
  search: RootRouteSearch,
  enabled: boolean,
): RootRouteSearch {
  return {
    ...search,
    dev: enabled ? true : undefined,
  };
}

export function buildLandingDevToggleSearch(
  search: RootRouteSearch,
): RootRouteSearch {
  return buildLandingDevModeSearch(
    search,
    !isLandingDevModeEnabled(search),
  );
}

export function getLandingDevToggleLabel(search: SearchFlagReader): string {
  return isLandingDevModeEnabled(search) ? "/" : LANDING_DEV_MODE_TOGGLE_LABEL;
}
