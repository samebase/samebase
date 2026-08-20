import { createFileRoute } from "@tanstack/react-router";
import { DocsReceiptsPage } from "@/components/LandingPreviewPage";
import {
  DOCS_RECEIPTS_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_RECEIPTS_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/receipts")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_RECEIPTS_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsReceiptsPage,
  head: () => buildPageHead(DOCS_RECEIPTS_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
