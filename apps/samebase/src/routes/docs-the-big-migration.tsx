import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { DocsTheBigMigrationPage } from "@/components/LandingPreviewPage";
import { DOCS_THE_BIG_MIGRATION_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_THE_BIG_MIGRATION_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/the-big-migration")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_THE_BIG_MIGRATION_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: DocsTheBigMigrationPage,
  head: () => buildPageHead(DOCS_THE_BIG_MIGRATION_PAGE_METADATA),
});
