import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
} from "@/routing/searchParamMetadata";

export const DELETE_ACCOUNT_QUERY_PARAM = "delete-account";

const RouteSearchSchema_settings = defineRouteSearchParams({
  [DELETE_ACCOUNT_QUERY_PARAM]: routeSearchPresenceParam({
    access: "access_user_preferences",
    suggestion: "route",
  }),
});

export type SettingsRouteSearch = InferRouteSearch<typeof RouteSearchSchema_settings>;

const settingsRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_settings);

const SETTINGS_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(settingsRouteSearchParamMetadata);

export const SETTINGS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  settingsRouteSearchParamMetadata,
);

export function validateSettingsRouteSearch(search: Record<string, unknown>): SettingsRouteSearch {
  return RouteSearchSchema_settings.parse(
    normalizeRouteSearchPresenceFlags(search, SETTINGS_PRESENCE_SEARCH_KEYS),
  );
}
