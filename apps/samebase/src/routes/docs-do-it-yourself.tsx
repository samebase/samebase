import { createFileRoute } from "@tanstack/react-router";
import { DocsDoItYourselfPage } from "@/components/LandingPreviewPage";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { DOCS_DO_IT_YOURSELF_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function DocsDoItYourselfRouteComponent() {
  usePageMetadata(DOCS_DO_IT_YOURSELF_PAGE_METADATA);

  return <DocsDoItYourselfPage />;
}

export const Route = createFileRoute("/docs/do-it-yourself")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_DO_IT_YOURSELF_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsDoItYourselfRouteComponent,
  validateSearch: validateDocsRouteSearch,
});
