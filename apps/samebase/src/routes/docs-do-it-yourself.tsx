import { createFileRoute } from "@tanstack/react-router";
import { DocsDoItYourselfPage } from "@/publicSite/LandingPreviewPage";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_DO_IT_YOURSELF_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/do-it-yourself")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_DO_IT_YOURSELF_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsDoItYourselfPage,
  head: () => buildPageHead(DOCS_DO_IT_YOURSELF_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
