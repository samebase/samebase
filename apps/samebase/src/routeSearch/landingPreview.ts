import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
} from "@/routing/searchParamMetadata";
import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";

export const LANDING_MARKDOWN_PREVIEW_ROUTE = "/landing-preview";
export const LANDING_DO_IT_YOURSELF_ROUTE = "/landing/do-it-yourself";

export const LANDING_MARKDOWN_PREVIEW_TEST_ID = "landing-markdown-preview";
export const LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID = "landing-markdown-preview-article";
export const LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID = "landing-markdown-preview-sidebar";

const RouteSearchSchema_landingMarkdownPreview = defineRouteSearchParams({
  left: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
  right: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
});

export type LandingMarkdownPreviewRouteSearch = InferRouteSearch<
  typeof RouteSearchSchema_landingMarkdownPreview
>;

const landingMarkdownPreviewRouteSearchParamMetadata = readRouteSearchParamMetadata(
  RouteSearchSchema_landingMarkdownPreview,
);

const LANDING_MARKDOWN_PREVIEW_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  landingMarkdownPreviewRouteSearchParamMetadata,
);

export const LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_STATIC_DATA = readRouteSearchStaticData(
  landingMarkdownPreviewRouteSearchParamMetadata,
);

export function validateLandingMarkdownPreviewRouteSearch(
  search: Record<string, unknown>,
): LandingMarkdownPreviewRouteSearch {
  return RouteSearchSchema_landingMarkdownPreview.parse(
    normalizeRouteSearchPresenceFlags(search, LANDING_MARKDOWN_PREVIEW_PRESENCE_SEARCH_KEYS),
  );
}
