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
/** An organization's page lists one owner's clients, so it groups by repository or not at all. */
export const ORGANIZATION_HUB_CLIENTS_GROUP_VALUES = ["none"] as const;

/**
The hub clients pages keep their search, filters, and grouping in the URL, so a filtered view is a
link. A filter holds comma-separated values, such as `stage=preview,development`. No `group` groups
by repository. The admin page lists every owner; an organization's page lists its own repositories
and has no owner filter.
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

const RouteSearchSchema_organizationHubClients = defineRouteSearchParams({
  q: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_dashboard",
    sampleValue: "my-app",
    suggestion: "route",
    valueType: "freeform",
  }),
  stage: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_dashboard",
    sampleValue: "preview",
    suggestion: "route",
    valueType: "freeform",
  }),
  registered: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_dashboard",
    sampleValue: "laptop",
    suggestion: "route",
    valueType: "freeform",
  }),
  signIn: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_dashboard",
    sampleValue: "never",
    suggestion: "route",
    valueType: "freeform",
  }),
  group: routeSearchValueParam(routeSearchStringValue(ORGANIZATION_HUB_CLIENTS_GROUP_VALUES), {
    access: "access_dashboard",
    sampleValue: "none",
    suggestion: "route",
    valueSuggestions: ORGANIZATION_HUB_CLIENTS_GROUP_VALUES,
    valueType: "options",
  }),
});

/** The search of either page: an organization's page is the admin page's without `owner`. */
export type HubClientsRouteSearch = InferRouteSearch<typeof RouteSearchSchema_adminHubClients>;

export const ADMIN_HUB_CLIENTS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  readRouteSearchParamMetadata(RouteSearchSchema_adminHubClients),
);

export const ORGANIZATION_HUB_CLIENTS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  readRouteSearchParamMetadata(RouteSearchSchema_organizationHubClients),
);

export function validateAdminHubClientsRouteSearch(
  search: Record<string, unknown>,
): HubClientsRouteSearch {
  return RouteSearchSchema_adminHubClients.parse(search);
}

export function validateOrganizationHubClientsRouteSearch(
  search: Record<string, unknown>,
): InferRouteSearch<typeof RouteSearchSchema_organizationHubClients> {
  return RouteSearchSchema_organizationHubClients.parse(search);
}
