import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

export const GITHUB_CONNECTION_SESSION_QUERY_PARAM = "github-connection-session";

const RouteSearchSchema_connectOrganization = defineRouteSearchParams({
  [GITHUB_CONNECTION_SESSION_QUERY_PARAM]: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_app_create",
    suggestion: "hidden",
    valueType: "freeform",
    sampleValue: "setup-session",
  }),
});

export type ConnectOrganizationRouteSearch = InferRouteSearch<
  typeof RouteSearchSchema_connectOrganization
>;

const connectOrganizationRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_connectOrganization,
);

export const CONNECT_ORGANIZATION_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  connectOrganizationRouteSearchParamMetadata,
);

export function validateConnectOrganizationRouteSearch(
  search: Record<string, unknown>,
): ConnectOrganizationRouteSearch {
  return RouteSearchSchema_connectOrganization.parse(search);
}
