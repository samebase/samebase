import { describe, expect, it } from "vite-plus/test";
import {
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

  it("rejects organization billing return keys", () => {
    expect(
      validateSettingsRouteSearch({
        checkout: "success",
        customer_session_token: "return-state",
        owner: "samebase",
      }),
    ).toEqual({});
  });

  it("publishes only the account deletion search param", () => {
    expect(SETTINGS_ROUTE_SEARCH_STATIC_DATA).toEqual({
      acceptedSearchKeys: [DELETE_ACCOUNT_QUERY_PARAM],
      searchParamAccess: [
        {
          access: "access_account_deletion",
          key: DELETE_ACCOUNT_QUERY_PARAM,
        },
      ],
      searchParamSuggestions: [
        {
          access: "access_account_deletion",
          key: DELETE_ACCOUNT_QUERY_PARAM,
          searchParamKind: "presence",
        },
      ],
    });
  });
});
