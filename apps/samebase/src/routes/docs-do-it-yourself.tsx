import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { DocsDoItYourselfPage } from "@/components/LandingPreviewPage";
import { DOCS_DO_IT_YOURSELF_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_DO_IT_YOURSELF_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/do-it-yourself")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_DO_IT_YOURSELF_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: DocsDoItYourselfPage,
  head: () => buildPageHead(DOCS_DO_IT_YOURSELF_PAGE_METADATA),
});
