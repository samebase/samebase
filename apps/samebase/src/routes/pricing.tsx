import { createFileRoute } from "@tanstack/react-router";
import { DocsPricingPage } from "@/components/LandingPreviewPage";
import {
  DOCS_PRICING_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_PRICING_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/pricing")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_PRICING_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsPricingPage,
  head: () => buildPageHead(DOCS_PRICING_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
