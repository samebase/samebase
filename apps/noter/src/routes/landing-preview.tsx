import { createFileRoute } from "@tanstack/react-router";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import {
  LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  resolveLandingMarkdownPreviewLanguage,
  validateLandingMarkdownPreviewRouteSearch,
} from "@/lib/landingMarkdownPreview";
import { LANDING_MARKDOWN_PREVIEW_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";

function LandingPreviewRouteComponent() {
  usePageMetadata(LANDING_MARKDOWN_PREVIEW_PAGE_METADATA);
  const language = resolveLandingMarkdownPreviewLanguage(Route.useSearch());

  return <LandingMarkdownPreviewPage language={language} />;
}

export const Route = createFileRoute("/landing-preview")({
  ssr: false,
  staticData: {
    permission: "admin",
    searchParamSuggestions: LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LandingPreviewRouteComponent,
  validateSearch: validateLandingMarkdownPreviewRouteSearch,
});
