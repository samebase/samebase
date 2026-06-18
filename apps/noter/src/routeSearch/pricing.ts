import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

const pricingCheckoutValues = ["success", "cancel"] as const;

const RouteSearchSchema_pricing = defineRouteSearchParams({
  checkout: routeSearchValueParam(routeSearchStringValue(pricingCheckoutValues), {
    access: "access_dashboard",
    sampleValue: "success",
    suggestion: "route",
    valueSuggestions: pricingCheckoutValues,
    valueType: "options",
  }),
});

export type PricingRouteSearch = InferRouteSearch<typeof RouteSearchSchema_pricing>;

const pricingRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_pricing);

export const PRICING_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  pricingRouteSearchParamMetadata,
);

export function validatePricingRouteSearch(search: Record<string, unknown>): PricingRouteSearch {
  return RouteSearchSchema_pricing.parse(search);
}

export function buildPricingRouteSearch(
  checkout: PricingRouteSearch["checkout"] | null | undefined,
): PricingRouteSearch {
  return checkout === "success" || checkout === "cancel" ? { checkout } : {};
}
