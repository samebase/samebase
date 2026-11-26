import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

export const BROKER_CLIENTS_GROUP_VALUES = ["owner", "none"] as const;
/** An organization's page lists one owner's clients, so it groups by repository or not at all. */
export const ORGANIZATION_BROKER_CLIENTS_GROUP_VALUES = ["none"] as const;

/**
The broker clients pages keep their search, filters, and grouping in the URL, so a filtered view is a
link. A filter holds comma-separated values, such as `stage=preview,development`. No `group` groups
by repository. The admin page lists every owner; an organization's page lists its own repositories
and has no owner filter.
*/
const RouteSearchSchema_adminBrokerClients = defineRouteSearchParams({
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
    sampleValue: "development",
    suggestion: "route",
    valueType: "freeform",
  }),
  signIn: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_admin",
    sampleValue: "never",
    suggestion: "route",
    valueType: "freeform",
  }),
  group: routeSearchValueParam(routeSearchStringValue(BROKER_CLIENTS_GROUP_VALUES), {
    access: "access_admin",
    sampleValue: "owner",
    suggestion: "route",
    valueSuggestions: BROKER_CLIENTS_GROUP_VALUES,
    valueType: "options",
  }),
});

const RouteSearchSchema_organizationBrokerClients = defineRouteSearchParams({
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
    sampleValue: "development",
    suggestion: "route",
    valueType: "freeform",
  }),
  signIn: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_dashboard",
    sampleValue: "never",
    suggestion: "route",
    valueType: "freeform",
  }),
  group: routeSearchValueParam(routeSearchStringValue(ORGANIZATION_BROKER_CLIENTS_GROUP_VALUES), {
    access: "access_dashboard",
    sampleValue: "none",
    suggestion: "route",
    valueSuggestions: ORGANIZATION_BROKER_CLIENTS_GROUP_VALUES,
    valueType: "options",
  }),
});

/** The search of either page: an organization's page is the admin page's without `owner`. */
export type BrokerClientsRouteSearch = InferRouteSearch<typeof RouteSearchSchema_adminBrokerClients>;

export const ADMIN_BROKER_CLIENTS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  readRouteSearchParamMetadata(RouteSearchSchema_adminBrokerClients),
);

export const ORGANIZATION_BROKER_CLIENTS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  readRouteSearchParamMetadata(RouteSearchSchema_organizationBrokerClients),
);

export function validateAdminBrokerClientsRouteSearch(
  search: Record<string, unknown>,
): BrokerClientsRouteSearch {
  return RouteSearchSchema_adminBrokerClients.parse(search);
}

export function validateOrganizationBrokerClientsRouteSearch(
  search: Record<string, unknown>,
): InferRouteSearch<typeof RouteSearchSchema_organizationBrokerClients> {
  return RouteSearchSchema_organizationBrokerClients.parse(search);
}
