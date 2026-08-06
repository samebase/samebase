import { describe, expect, it } from "vite-plus/test";
import {
  CHECKOUT_QUERY_PARAM,
  ORGANIZATION_BILLING_ROUTE_SEARCH_STATIC_DATA,
  POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
  validateOrganizationBillingRouteSearch,
} from "@/routeSearch/organizationBilling";

describe("organization billing route search", () => {
  it("accepts supported checkout return states", () => {
    expect(validateOrganizationBillingRouteSearch({ [CHECKOUT_QUERY_PARAM]: "success" })).toEqual({
      [CHECKOUT_QUERY_PARAM]: "success",
    });
    expect(validateOrganizationBillingRouteSearch({ [CHECKOUT_QUERY_PARAM]: "cancel" })).toEqual({
      [CHECKOUT_QUERY_PARAM]: "cancel",
    });
    expect(validateOrganizationBillingRouteSearch({ [CHECKOUT_QUERY_PARAM]: "paid" })).toEqual({});
  });

  it("keeps only the presence of the customer session token", () => {
    expect(
      validateOrganizationBillingRouteSearch({
        [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: "return-state",
      }),
    ).toEqual({ [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: true });
  });

  it("publishes the scoped billing return params", () => {
    expect(ORGANIZATION_BILLING_ROUTE_SEARCH_STATIC_DATA).toEqual({
      acceptedSearchKeys: [CHECKOUT_QUERY_PARAM, POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM],
      searchParamAccess: [
        {
          access: "access_user_preferences",
          key: CHECKOUT_QUERY_PARAM,
        },
        {
          access: "access_user_preferences",
          key: POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
        },
      ],
      searchParamSuggestions: [],
    });
  });
});
