import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/Layout";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import { LANDING_MARKDOWN_PREVIEW_ROUTE } from "@/lib/landingMarkdownPreview";
import { LANDING_MARKDOWN_PREVIEW_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";

function LandingPreviewRouteComponent() {
  usePageMetadata(LANDING_MARKDOWN_PREVIEW_PAGE_METADATA);

  return (
    <Layout>
      <LandingMarkdownPreviewPage />
    </Layout>
  );
}

export const Route = createFileRoute(LANDING_MARKDOWN_PREVIEW_ROUTE)({
  component: LandingPreviewRouteComponent,
});
