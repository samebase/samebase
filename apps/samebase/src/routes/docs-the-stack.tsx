import { createFileRoute } from "@tanstack/react-router";
import { DocsTheStackPage } from "@/publicSite/LandingPreviewPage";
import {
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  DOCS_THE_STACK_ROUTE,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_THE_STACK_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/the-stack")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_THE_STACK_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsTheStackPage,
  head: () => buildPageHead(DOCS_THE_STACK_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
