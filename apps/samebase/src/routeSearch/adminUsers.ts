import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
} from "@/routing/searchParamMetadata";

export const INCLUDE_SCRUBBED_QUERY_PARAM = "includeScrubbed";

const RouteSearchSchema_adminUsers = defineRouteSearchParams({
  [INCLUDE_SCRUBBED_QUERY_PARAM]: routeSearchPresenceParam({
    access: "access_admin",
    suggestion: "route",
  }),
});

export type AdminUsersRouteSearch = InferRouteSearch<typeof RouteSearchSchema_adminUsers>;

const adminUsersRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_adminUsers,
);

const ADMIN_USERS_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  adminUsersRouteSearchParamMetadata,
);

export const ADMIN_USERS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  adminUsersRouteSearchParamMetadata,
);

export function validateAdminUsersRouteSearch(
  search: Record<string, unknown>,
): AdminUsersRouteSearch {
  return RouteSearchSchema_adminUsers.parse(
    normalizeRouteSearchPresenceFlags(search, ADMIN_USERS_PRESENCE_SEARCH_KEYS),
  );
}
