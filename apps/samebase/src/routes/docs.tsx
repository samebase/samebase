import { createFileRoute } from "@tanstack/react-router";
import { DocsIndexPage } from "@/components/LandingPreviewPage";
import {
  DOCS_INDEX_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { DOCS_INDEX_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function DocsIndexRouteComponent() {
  usePageMetadata(DOCS_INDEX_PAGE_METADATA);

  return <DocsIndexPage />;
}

export const Route = createFileRoute("/docs")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_INDEX_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsIndexRouteComponent,
  validateSearch: validateDocsRouteSearch,
});
