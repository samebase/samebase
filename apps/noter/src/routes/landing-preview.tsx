import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/Layout";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import {
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

export const Route = createFileRoute("/landing-preview")({
  component: LandingPreviewRouteComponent,
  validateSearch: validateLandingMarkdownPreviewRouteSearch,
});
