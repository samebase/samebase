import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

export const HUB_CLIENTS_GROUP_VALUES = ["owner", "none"] as const;

/**
The admin hub clients page keeps its search, filters, and grouping in the URL, so a filtered view is
a link. A filter holds comma-separated values, such as `stage=preview,development`. No `group`
groups by repository.
*/
const RouteSearchSchema_adminHubClients = defineRouteSearchParams({
  q: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_admin",
    sampleValue: "samebase",
    suggestion: "route",
    valueType: "freeform",
  }),
  owner: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_admin",
    sampleValue: "samebase",
    suggestion: "route",
    valueType: "freeform",
  }),
  stage: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_admin",
    sampleValue: "preview",
    suggestion: "route",
    valueType: "freeform",
  }),
  registered: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_admin",
    sampleValue: "laptop",
    suggestion: "route",
    valueType: "freeform",
  }),
  signIn: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_admin",
    sampleValue: "never",
    suggestion: "route",
    valueType: "freeform",
  }),
  group: routeSearchValueParam(routeSearchStringValue(HUB_CLIENTS_GROUP_VALUES), {
    access: "access_admin",
    sampleValue: "owner",
    suggestion: "route",
    valueSuggestions: HUB_CLIENTS_GROUP_VALUES,
    valueType: "options",
  }),
});

export type AdminHubClientsRouteSearch = InferRouteSearch<typeof RouteSearchSchema_adminHubClients>;

export const ADMIN_HUB_CLIENTS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  readRouteSearchParamMetadata(RouteSearchSchema_adminHubClients),
);

export function validateAdminHubClientsRouteSearch(
  search: Record<string, unknown>,
): AdminHubClientsRouteSearch {
  return RouteSearchSchema_adminHubClients.parse(search);
}
