import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNonEmptyString,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

export const ALCHEMY_VIEWS = ["tree", "inventory", "dependencies", "bindings"] as const;

const RouteSearchSchema_alchemy = defineRouteSearchParams({
  view: routeSearchValueParam(routeSearchStringValue(ALCHEMY_VIEWS), {
    access: "access_dashboard",
    sampleValue: "bindings",
    suggestion: "route",
    valueSuggestions: ALCHEMY_VIEWS,
    valueType: "options",
  }),
  stack: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_dashboard",
    sampleValue: "convex:owner/repository",
    suggestion: "route",
    valueType: "freeform",
  }),
  stage: routeSearchValueParam(routeSearchNonEmptyString, {
    access: "access_dashboard",
    sampleValue: "prod",
    suggestion: "route",
    valueType: "freeform",
  }),
});

export type AlchemyRouteSearch = InferRouteSearch<typeof RouteSearchSchema_alchemy>;
export const ALCHEMY_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  readRouteSearchParamMetadata(RouteSearchSchema_alchemy),
);
export function validateAlchemyRouteSearch(search: Record<string, unknown>): AlchemyRouteSearch {
  return RouteSearchSchema_alchemy.parse(search);
}
