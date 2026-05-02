import { z } from "zod";

export const LANDING_MARKDOWN_PREVIEW_ROUTE = "/landing-preview";

export const LANDING_MARKDOWN_PREVIEW_TEST_ID = "landing-markdown-preview";
export const LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID =
  "landing-markdown-preview-article";
export const LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID =
  "landing-markdown-preview-sidebar";
export const LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM = "lang";

const LANDING_MARKDOWN_PREVIEW_LANGUAGES = ["en", "ro"] as const;

export type LandingMarkdownPreviewLanguage =
  (typeof LANDING_MARKDOWN_PREVIEW_LANGUAGES)[number];

export const LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE = "en";
export const LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL = `?${LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM}=ro`;

function readOptionalLandingMarkdownPreviewLanguage(
  value: unknown,
): LandingMarkdownPreviewLanguage | undefined {
  return value === "en" || value === "ro" ? value : undefined;
}

const landingMarkdownPreviewRouteSearchSchema = z.object({
  [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: z.preprocess(
    readOptionalLandingMarkdownPreviewLanguage,
    z.enum(LANDING_MARKDOWN_PREVIEW_LANGUAGES).optional(),
  ),
});

export type LandingMarkdownPreviewRouteSearch = z.infer<
  typeof landingMarkdownPreviewRouteSearchSchema
>;

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
