import { hasRouteSearchPresenceFlag } from "@/lib/routeSearchFlags";
import { type RootRouteSearch } from "./rootRouteSearch";

export const LANDING_DEV_MODE_QUERY_PARAM = "dev";
export const LANDING_DEV_MODE_LINK_LABEL = "?dev";
export const LANDING_DEV_MODE_DISABLE_LINK_LABEL = "?-dev";

type SearchFlagReader = URLSearchParams | Readonly<Record<string, unknown>>;

export function isLandingDevModeEnabled(search: SearchFlagReader): boolean {
  return hasRouteSearchPresenceFlag(search, LANDING_DEV_MODE_QUERY_PARAM);
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
