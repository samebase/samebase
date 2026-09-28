import { createFileRoute } from "@tanstack/react-router";
import { DocsIndexPage } from "@/publicSite/LandingPreviewPage";
import {
  DOCS_INDEX_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_INDEX_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_INDEX_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsIndexPage,
  head: () => buildPageHead(DOCS_INDEX_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
