import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

export const CHECKOUT_QUERY_PARAM = "checkout";
export const DELETE_ACCOUNT_QUERY_PARAM = "delete-account";
export const GITHUB_OWNER_QUERY_PARAM = "owner";
export const POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM = "customer_session_token";

const RouteSearchSchema_settings = defineRouteSearchParams({
  [CHECKOUT_QUERY_PARAM]: routeSearchValueParam(routeSearchStringValue(["success", "cancel"]), {
    access: "access_user_preferences",
    sampleValue: "success",
    suggestion: "hidden",
    valueSuggestions: ["success", "cancel"],
    valueType: "options",
  }),
  [GITHUB_OWNER_QUERY_PARAM]: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_user_preferences",
    sampleValue: "samebase",
    suggestion: "hidden",
    valueType: "freeform",
  }),
  [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: routeSearchPresenceParam({
    access: "access_user_preferences",
    suggestion: "hidden",
  }),
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
