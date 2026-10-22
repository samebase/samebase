import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
} from "@/routing/searchParamMetadata";

const RouteSearchSchema_repositoryOverview = defineRouteSearchParams({
  /**
  The default-branch block and the pull request rows come from the attachment rows and their live
  reads, as if the Alchemy state store of the team held no stack of the repository.
  */
  attachments: routeSearchPresenceParam({
    access: "access_dashboard",
    suggestion: "hidden",
  }),
});

type RepositoryOverviewRouteSearch = InferRouteSearch<typeof RouteSearchSchema_repositoryOverview>;

const repositoryOverviewRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_repositoryOverview,
);

const REPOSITORY_OVERVIEW_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  repositoryOverviewRouteSearchParamMetadata,
);

export const REPOSITORY_OVERVIEW_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  repositoryOverviewRouteSearchParamMetadata,
);

export function validateRepositoryOverviewRouteSearch(
  search: Record<string, unknown>,
): RepositoryOverviewRouteSearch {
  return RouteSearchSchema_repositoryOverview.parse(
    normalizeRouteSearchPresenceFlags(search, REPOSITORY_OVERVIEW_PRESENCE_SEARCH_KEYS),
  );
}
