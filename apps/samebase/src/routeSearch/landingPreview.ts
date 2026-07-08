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
export const DOCS_DO_IT_YOURSELF_ROUTE = "/docs/do-it-yourself";
export const DOCS_RECEIPTS_ROUTE = "/docs/receipts";
export const DOCS_THE_STACK_ROUTE = "/docs/the-stack";
export const DOCS_PRICING_ROUTE = "/pricing";

export const LANDING_PREVIEW_TEST_ID = "landing-preview";
export const LANDING_PREVIEW_ARTICLE_TEST_ID = "landing-preview-article";
export const DOCS_SIDEBAR_TEST_ID = "docs-sidebar";

// The landing keeps its left pane surface for now: the workspace prehydration
// script expects the pane element to exist. A later PR makes the landing
// sidebar-less together with prehydration support for pane-less routes.
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

const RouteSearchSchema_docs = defineRouteSearchParams({
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
export type DocsRouteSearch = InferRouteSearch<typeof RouteSearchSchema_docs>;

const landingPreviewRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_landingPreview,
);
const docsRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_docs);

const LANDING_PREVIEW_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  landingPreviewRouteSearchParamMetadata,
);
const DOCS_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(docsRouteSearchParamMetadata);

export const LANDING_PREVIEW_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  landingPreviewRouteSearchParamMetadata,
);
export const DOCS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  docsRouteSearchParamMetadata,
);

export function validateLandingPreviewRouteSearch(
  search: Record<string, unknown>,
): LandingPreviewRouteSearch {
  return RouteSearchSchema_landingPreview.parse(
    normalizeRouteSearchPresenceFlags(search, LANDING_PREVIEW_PRESENCE_SEARCH_KEYS),
  );
}

export function validateDocsRouteSearch(search: Record<string, unknown>): DocsRouteSearch {
  return RouteSearchSchema_docs.parse(
    normalizeRouteSearchPresenceFlags(search, DOCS_PRESENCE_SEARCH_KEYS),
  );
}
