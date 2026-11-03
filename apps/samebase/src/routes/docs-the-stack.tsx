import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { DocsTheStackPage } from "@/components/LandingPreviewPage";
import { DOCS_THE_STACK_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_THE_STACK_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/the-stack")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_THE_STACK_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: DocsTheStackPage,
  head: () => buildPageHead(DOCS_THE_STACK_PAGE_METADATA),
});
