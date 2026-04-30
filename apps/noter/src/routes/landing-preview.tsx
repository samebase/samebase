import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/Layout";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import {
  LANDING_MARKDOWN_PREVIEW_ROUTE,
  resolveLandingMarkdownPreviewLanguage,
  validateLandingMarkdownPreviewRouteSearch,
} from "@/lib/landingMarkdownPreview";
import { LANDING_MARKDOWN_PREVIEW_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";

function LandingPreviewRouteComponent() {
  usePageMetadata(LANDING_MARKDOWN_PREVIEW_PAGE_METADATA);
  const language = resolveLandingMarkdownPreviewLanguage(Route.useSearch());

  return (
    <Layout>
      <LandingMarkdownPreviewPage language={language} />
    </Layout>
  );
}

export const Route = createFileRoute(LANDING_MARKDOWN_PREVIEW_ROUTE)({
  component: LandingPreviewRouteComponent,
  validateSearch: validateLandingMarkdownPreviewRouteSearch,
});
