import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  readRouteSearchStaticData,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";
import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";

export const LANDING_MARKDOWN_PREVIEW_ROUTE = "/landing-preview";

export const LANDING_MARKDOWN_PREVIEW_TEST_ID = "landing-markdown-preview";
export const LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID = "landing-markdown-preview-article";
export const LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID = "landing-markdown-preview-sidebar";
export const LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM = "lang";

const LANDING_MARKDOWN_PREVIEW_LANGUAGES = ["en", "ro"] as const;

export type LandingMarkdownPreviewLanguage = (typeof LANDING_MARKDOWN_PREVIEW_LANGUAGES)[number];

export const LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE = "en";
export const LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL = `?${LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM}=ro`;

const RouteSearchSchema_landingMarkdownPreview = defineRouteSearchParams({
  left: routeSearchPresenceParam({
    access: "access_admin",
    suggestion: "hidden",
  }),
  [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: routeSearchValueParam(
    routeSearchStringValue(LANDING_MARKDOWN_PREVIEW_LANGUAGES),
    {
      access: "access_admin",
      sampleValue: "ro",
      suggestion: "route",
      valueSuggestions: LANDING_MARKDOWN_PREVIEW_LANGUAGES,
      valueType: "options",
    },
  ),
  right: routeSearchPresenceParam({
    access: "access_admin",
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

export function resolveLandingMarkdownPreviewLanguage(
  search: LandingMarkdownPreviewRouteSearch,
): LandingMarkdownPreviewLanguage {
  return search.lang ?? LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE;
}
