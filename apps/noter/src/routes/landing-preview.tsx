import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import { LANDING_MARKDOWN_PREVIEW_ROUTE } from "@/lib/landingMarkdownPreview";

function LandingPreviewRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <LandingMarkdownPreviewPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute(LANDING_MARKDOWN_PREVIEW_ROUTE)({
  component: LandingPreviewRouteComponent,
});
