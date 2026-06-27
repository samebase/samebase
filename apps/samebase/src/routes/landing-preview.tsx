import { createFileRoute } from "@tanstack/react-router";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import {
  LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_STATIC_DATA,
  validateLandingMarkdownPreviewRouteSearch,
} from "@/routeSearch/landingPreview";
import { LANDING_MARKDOWN_PREVIEW_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/landing-preview";

function LandingPreviewRouteComponent() {
  usePageMetadata(LANDING_MARKDOWN_PREVIEW_PAGE_METADATA);

  return <LandingMarkdownPreviewPage />;
}

export const Route = createFileRoute("/landing-preview")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...LANDING_MARKDOWN_PREVIEW_ROUTE_SEARCH_STATIC_DATA,
  },
  component: LandingPreviewRouteComponent,
  validateSearch: validateLandingMarkdownPreviewRouteSearch,
});
