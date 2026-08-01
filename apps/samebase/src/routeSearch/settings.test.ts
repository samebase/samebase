import { describe, expect, it } from "vite-plus/test";
import {
  CHECKOUT_QUERY_PARAM,
  DELETE_ACCOUNT_QUERY_PARAM,
  SETTINGS_ROUTE_SEARCH_STATIC_DATA,
  validateSettingsRouteSearch,
} from "@/routeSearch/settings";

describe("settings route search", () => {
  it("treats delete-account as a key-only presence flag", () => {
    expect(validateSettingsRouteSearch({ [DELETE_ACCOUNT_QUERY_PARAM]: "false" })).toEqual({
      [DELETE_ACCOUNT_QUERY_PARAM]: true,
    });
    expect(validateSettingsRouteSearch({})).toEqual({});
  });

  it("accepts only supported checkout return states", () => {
    expect(validateSettingsRouteSearch({ [CHECKOUT_QUERY_PARAM]: "success" })).toEqual({
      [CHECKOUT_QUERY_PARAM]: "success",
    });
    expect(validateSettingsRouteSearch({ [CHECKOUT_QUERY_PARAM]: "cancel" })).toEqual({
      [CHECKOUT_QUERY_PARAM]: "cancel",
    });
    expect(validateSettingsRouteSearch({ [CHECKOUT_QUERY_PARAM]: "paid" })).toEqual({});
  });

  it("publishes both access-controlled settings params", () => {
    expect(SETTINGS_ROUTE_SEARCH_STATIC_DATA).toEqual({
      acceptedSearchKeys: [CHECKOUT_QUERY_PARAM, DELETE_ACCOUNT_QUERY_PARAM],
      searchParamAccess: [
        {
          access: "access_user_preferences",
          key: CHECKOUT_QUERY_PARAM,
        },
        {
          access: "access_user_preferences",
          key: DELETE_ACCOUNT_QUERY_PARAM,
        },
      ],
      searchParamSuggestions: [
        {
          access: "access_user_preferences",
          key: DELETE_ACCOUNT_QUERY_PARAM,
          searchParamKind: "presence",
        },
      ],
    });
  });
});
