import { describe, expect, it } from "vite-plus/test";
import {
  ADMIN_USERS_ROUTE_SEARCH_STATIC_DATA,
  INCLUDE_SCRUBBED_QUERY_PARAM,
  validateAdminUsersRouteSearch,
} from "@/routeSearch/adminUsers";

describe("admin users route search", () => {
  it("treats includeScrubbed as a key-only presence flag", () => {
    expect(validateAdminUsersRouteSearch({ [INCLUDE_SCRUBBED_QUERY_PARAM]: "false" })).toEqual({
      [INCLUDE_SCRUBBED_QUERY_PARAM]: true,
    });
    expect(validateAdminUsersRouteSearch({})).toEqual({});
    expect(validateAdminUsersRouteSearch({ [INCLUDE_SCRUBBED_QUERY_PARAM]: null })).toEqual({});
  });

  it("publishes only the admin users search param", () => {
    expect(ADMIN_USERS_ROUTE_SEARCH_STATIC_DATA).toEqual({
      acceptedSearchKeys: [INCLUDE_SCRUBBED_QUERY_PARAM],
      searchParamAccess: [
        {
          access: "access_admin",
          key: INCLUDE_SCRUBBED_QUERY_PARAM,
        },
      ],
      searchParamSuggestions: [
        {
          access: "access_admin",
          key: INCLUDE_SCRUBBED_QUERY_PARAM,
          searchParamKind: "presence",
        },
      ],
    });
  });
});
