import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { DocsReceiptsPage } from "@/components/LandingPreviewPage";
import { DOCS_RECEIPTS_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_RECEIPTS_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/receipts")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_RECEIPTS_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: DocsReceiptsPage,
  head: () => buildPageHead(DOCS_RECEIPTS_PAGE_METADATA),
});
