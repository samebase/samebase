import { createFileRoute } from "@tanstack/react-router";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import {
  LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_KEYS,
  LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_ACCESS,
  LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  resolveLandingMarkdownPreviewLanguage,
  validateLandingMarkdownPreviewRouteSearch,
} from "@/lib/landingMarkdownPreview";
import { LANDING_MARKDOWN_PREVIEW_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/landing-preview";

function LandingPreviewRouteComponent() {
  usePageMetadata(LANDING_MARKDOWN_PREVIEW_PAGE_METADATA);
  const language = resolveLandingMarkdownPreviewLanguage(Route.useSearch());

  return <LandingMarkdownPreviewPage language={language} />;
}

export const Route = createFileRoute("/landing-preview")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_KEYS,
    searchParamAccess: LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LandingPreviewRouteComponent,
  validateSearch: validateLandingMarkdownPreviewRouteSearch,
});
