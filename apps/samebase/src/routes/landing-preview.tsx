import { createFileRoute } from "@tanstack/react-router";
import { LandingPreviewPage } from "@/components/LandingPreviewPage";
import {
  LANDING_PREVIEW_ROUTE_SEARCH_STATIC_DATA,
  validateLandingPreviewRouteSearch,
} from "@/routeSearch/landingPreview";
import { LANDING_PREVIEW_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/landing-preview";

function LandingPreviewRouteComponent() {
  usePageMetadata(LANDING_PREVIEW_PAGE_METADATA);

  return <LandingPreviewPage />;
}

export const Route = createFileRoute("/landing-preview")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...LANDING_PREVIEW_ROUTE_SEARCH_STATIC_DATA,
  },
  component: LandingPreviewRouteComponent,
  validateSearch: validateLandingPreviewRouteSearch,
});
