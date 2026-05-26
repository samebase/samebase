import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamSuggestions,
  readRouteSearchParamMetadata,
  routeSearchStringValue,
  routeSearchValueParam,
} from "@/lib/routeSearchParamMetadata";

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
  [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: routeSearchValueParam(
    routeSearchStringValue(LANDING_MARKDOWN_PREVIEW_LANGUAGES),
    {
      permission: "admin",
      suggestion: "route",
      valueSuggestions: LANDING_MARKDOWN_PREVIEW_LANGUAGES,
    },
  ),
});

export type LandingMarkdownPreviewRouteSearch = InferRouteSearch<
  typeof landingMarkdownPreviewRouteSearchSchema
>;

const landingMarkdownPreviewRouteSearchParamMetadata = readRouteSearchParamMetadata(
  landingMarkdownPreviewRouteSearchSchema,
);

export const LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS =
  readRouteSearchParamSuggestions(landingMarkdownPreviewRouteSearchParamMetadata, "route");

export function validateLandingMarkdownPreviewRouteSearch(
  search: Record<string, unknown>,
): LandingMarkdownPreviewRouteSearch {
  return landingMarkdownPreviewRouteSearchSchema.parse(search);
}

export function resolveLandingMarkdownPreviewLanguage(
  search: LandingMarkdownPreviewRouteSearch,
): LandingMarkdownPreviewLanguage {
  return search.lang ?? LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE;
}
