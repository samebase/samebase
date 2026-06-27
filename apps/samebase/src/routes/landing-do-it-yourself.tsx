import { createFileRoute } from "@tanstack/react-router";
import { LandingDoItYourselfPage } from "@/components/LandingPreviewPage";
import {
  LANDING_DO_IT_YOURSELF_ROUTE,
  LANDING_PREVIEW_ROUTE_SEARCH_STATIC_DATA,
  validateLandingPreviewRouteSearch,
} from "@/routeSearch/landingPreview";
import { LANDING_DO_IT_YOURSELF_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function LandingDoItYourselfRouteComponent() {
  usePageMetadata(LANDING_DO_IT_YOURSELF_PAGE_METADATA);

  return <LandingDoItYourselfPage />;
}

export const Route = createFileRoute("/landing/do-it-yourself")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[LANDING_DO_IT_YOURSELF_ROUTE],
    ...LANDING_PREVIEW_ROUTE_SEARCH_STATIC_DATA,
  },
  component: LandingDoItYourselfRouteComponent,
  validateSearch: validateLandingPreviewRouteSearch,
});
