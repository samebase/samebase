import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
} from "@/routing/searchParamMetadata";
import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";

export const LANDING_PREVIEW_ROUTE = "/landing-preview";
export const LANDING_DO_IT_YOURSELF_ROUTE = "/landing/do-it-yourself";

export const LANDING_PREVIEW_TEST_ID = "landing-preview";
export const LANDING_PREVIEW_ARTICLE_TEST_ID = "landing-preview-article";
export const LANDING_PREVIEW_SIDEBAR_TEST_ID = "landing-preview-sidebar";

const RouteSearchSchema_landingPreview = defineRouteSearchParams({
  left: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
  right: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
});

export type LandingPreviewRouteSearch = InferRouteSearch<typeof RouteSearchSchema_landingPreview>;

const landingPreviewRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_landingPreview,
);

const LANDING_PREVIEW_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  landingPreviewRouteSearchParamMetadata,
);

export const LANDING_PREVIEW_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  landingPreviewRouteSearchParamMetadata,
);

export function validateLandingPreviewRouteSearch(
  search: Record<string, unknown>,
): LandingPreviewRouteSearch {
  return RouteSearchSchema_landingPreview.parse(
    normalizeRouteSearchPresenceFlags(search, LANDING_PREVIEW_PRESENCE_SEARCH_KEYS),
  );
}
