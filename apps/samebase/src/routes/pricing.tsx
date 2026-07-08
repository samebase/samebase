import { createFileRoute } from "@tanstack/react-router";
import { DocsPricingPage } from "@/components/LandingPreviewPage";
import {
  DOCS_PRICING_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { DOCS_PRICING_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function DocsPricingRouteComponent() {
  usePageMetadata(DOCS_PRICING_PAGE_METADATA);

  return <DocsPricingPage />;
}

export const Route = createFileRoute("/pricing")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_PRICING_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsPricingRouteComponent,
  validateSearch: validateDocsRouteSearch,
});
