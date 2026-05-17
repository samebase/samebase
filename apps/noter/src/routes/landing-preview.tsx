import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "#src/Layout.tsx";
import { LandingMarkdownPreviewPage } from "#src/components/LandingMarkdownPreviewPage.tsx";
import {
  resolveLandingMarkdownPreviewLanguage,
  validateLandingMarkdownPreviewRouteSearch,
} from "#src/lib/landingMarkdownPreview.ts";
import { LANDING_MARKDOWN_PREVIEW_PAGE_METADATA } from "#src/lib/pageMetadata.ts";
import { usePageMetadata } from "#src/lib/usePageMetadata.ts";

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
