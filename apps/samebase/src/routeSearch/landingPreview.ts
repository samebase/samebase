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
export const LANDING_PAGE_ROUTE = "/";
export const DOCS_INDEX_ROUTE = "/docs";
export const DOCS_CLOUDFLARE_SETUP_ROUTE = "/docs/cloudflare-setup";
export const DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_ROUTE = "/docs/cloudflare-previews-migration";
export const DOCS_DO_IT_YOURSELF_ROUTE = "/docs/do-it-yourself";
export const DOCS_RECEIPTS_ROUTE = "/docs/receipts";
export const DOCS_THE_BIG_MIGRATION_ROUTE = "/docs/the-big-migration";
export const DOCS_THE_STACK_ROUTE = "/docs/the-stack";
export const DOCS_PRICING_ROUTE = "/pricing";
export const DOCS_CHANGELOG_ROUTE = "/changelog";

export const LANDING_PREVIEW_TEST_ID = "landing-preview";
export const LANDING_PREVIEW_ARTICLE_TEST_ID = "landing-preview-article";
export const LANDING_PREVIEW_PROVIDER_GRID_TEST_ID = "landing-preview-provider-grid";
export const LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID = "landing-preview-platform-details";
export const DOCS_SIDEBAR_TEST_ID = "docs-sidebar";

// The landing keeps its left pane surface for now: the workspace prehydration
// script expects the pane element to exist. A later PR makes the landing
// sidebar-less together with prehydration support for pane-less routes.
const RouteSearchSchema_landingPage = defineRouteSearchParams({
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

export type LandingPageRouteSearch = InferRouteSearch<typeof RouteSearchSchema_landingPage>;
export type DocsRouteSearch = InferRouteSearch<typeof RouteSearchSchema_docs>;

const landingPageRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_landingPage,
);
const docsRouteSearchParamMetadata = readRouteSearchParamMetadata(RouteSearchSchema_docs);

const LANDING_PAGE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  landingPageRouteSearchParamMetadata,
);
const DOCS_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(docsRouteSearchParamMetadata);

export const LANDING_PAGE_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  landingPageRouteSearchParamMetadata,
);
export const DOCS_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  docsRouteSearchParamMetadata,
);

export function validateLandingPageRouteSearch(
  search: Record<string, unknown>,
): LandingPageRouteSearch {
  return RouteSearchSchema_landingPage.parse(
    normalizeRouteSearchPresenceFlags(search, LANDING_PAGE_PRESENCE_SEARCH_KEYS),
  );
}

export function validateDocsRouteSearch(search: Record<string, unknown>): DocsRouteSearch {
  return RouteSearchSchema_docs.parse(
    normalizeRouteSearchPresenceFlags(search, DOCS_PRESENCE_SEARCH_KEYS),
  );
}
