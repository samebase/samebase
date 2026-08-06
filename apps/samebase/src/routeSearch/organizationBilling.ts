import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";

export const CHECKOUT_QUERY_PARAM = "checkout";
export const POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM = "customer_session_token";

const RouteSearchSchema_organizationBilling = defineRouteSearchParams({
  [CHECKOUT_QUERY_PARAM]: routeSearchValueParam(routeSearchStringValue(["success", "cancel"]), {
    access: "access_user_preferences",
    sampleValue: "success",
    suggestion: "hidden",
    valueSuggestions: ["success", "cancel"],
    valueType: "options",
  }),
  [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: routeSearchPresenceParam({
    access: "access_user_preferences",
    suggestion: "hidden",
  }),
});

export type OrganizationBillingRouteSearch = InferRouteSearch<
  typeof RouteSearchSchema_organizationBilling
>;

const organizationBillingRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_organizationBilling,
);

const ORGANIZATION_BILLING_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  organizationBillingRouteSearchParamMetadata,
);

export const ORGANIZATION_BILLING_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  organizationBillingRouteSearchParamMetadata,
);

export function validateOrganizationBillingRouteSearch(
  search: Record<string, unknown>,
): OrganizationBillingRouteSearch {
  return RouteSearchSchema_organizationBilling.parse(
    normalizeRouteSearchPresenceFlags(search, ORGANIZATION_BILLING_PRESENCE_SEARCH_KEYS),
  );
}
