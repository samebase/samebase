import { createFileRoute } from "@tanstack/react-router";
import { DocsTheBigMigrationPage } from "@/components/LandingPreviewPage";
import {
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  DOCS_THE_BIG_MIGRATION_ROUTE,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_THE_BIG_MIGRATION_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/the-big-migration")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_THE_BIG_MIGRATION_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsTheBigMigrationPage,
  head: () => buildPageHead(DOCS_THE_BIG_MIGRATION_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
