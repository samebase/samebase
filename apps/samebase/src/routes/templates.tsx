import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { TemplatesGalleryPage } from "@/components/TemplatesPage";
import { TEMPLATES_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, TEMPLATES_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/templates")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[TEMPLATES_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: TemplatesGalleryPage,
  head: () => buildPageHead(TEMPLATES_PAGE_METADATA),
});
