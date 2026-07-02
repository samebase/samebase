import { createFileRoute } from "@tanstack/react-router";
import { DocsTheStackPage } from "@/components/LandingPreviewPage";
import {
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  DOCS_THE_STACK_ROUTE,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { DOCS_THE_STACK_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function DocsTheStackRouteComponent() {
  usePageMetadata(DOCS_THE_STACK_PAGE_METADATA);

  return <DocsTheStackPage />;
}

export const Route = createFileRoute("/docs/the-stack")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_THE_STACK_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsTheStackRouteComponent,
  validateSearch: validateDocsRouteSearch,
});
