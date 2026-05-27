import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  readRouteSearchPresenceKeys,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";
import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";

export const LANDING_MARKDOWN_PREVIEW_ROUTE = "/landing-preview";

export const LANDING_MARKDOWN_PREVIEW_TEST_ID = "landing-markdown-preview";
export const LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID = "landing-markdown-preview-article";
export const LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID = "landing-markdown-preview-sidebar";
export const LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM = "lang";

const LANDING_MARKDOWN_PREVIEW_LANGUAGES = ["en", "ro"] as const;

export type LandingMarkdownPreviewLanguage = (typeof LANDING_MARKDOWN_PREVIEW_LANGUAGES)[number];

export const LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE = "en";
export const LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL = `?${LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM}=ro`;

const landingMarkdownPreviewRouteSearchSchema = defineRouteSearchParams({
  left: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "hidden",
  }),
  [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: routeSearchValueParam(
    routeSearchStringValue(LANDING_MARKDOWN_PREVIEW_LANGUAGES),
    {
      permission: "admin",
      sampleValue: "ro",
      suggestion: "route",
      valueSuggestions: LANDING_MARKDOWN_PREVIEW_LANGUAGES,
      valueType: "options",
    },
  ),
  right: routeSearchPresenceParam({
    permission: "admin",
    suggestion: "hidden",
  }),
});

export type LandingMarkdownPreviewRouteSearch = InferRouteSearch<
  typeof landingMarkdownPreviewRouteSearchSchema
>;

const landingMarkdownPreviewRouteSearchParamMetadata = readRouteSearchParamMetadata(
  landingMarkdownPreviewRouteSearchSchema,
);

const LANDING_MARKDOWN_PREVIEW_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  landingMarkdownPreviewRouteSearchParamMetadata,
);

export const LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS =
  readRouteSearchParamSuggestions(landingMarkdownPreviewRouteSearchParamMetadata, "route");

export function validateLandingMarkdownPreviewRouteSearch(
  search: Record<string, unknown>,
): LandingMarkdownPreviewRouteSearch {
  return landingMarkdownPreviewRouteSearchSchema.parse(
    normalizeRouteSearchPresenceFlags(search, LANDING_MARKDOWN_PREVIEW_PRESENCE_SEARCH_KEYS),
  );
}

export function resolveLandingMarkdownPreviewLanguage(
  search: LandingMarkdownPreviewRouteSearch,
): LandingMarkdownPreviewLanguage {
  return search.lang ?? LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE;
}
