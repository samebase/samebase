import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { TemplateBasePage } from "@/components/TemplatesPage";
import { TEMPLATE_BASE_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, TEMPLATE_BASE_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/templates/base")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[TEMPLATE_BASE_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: TemplateBasePage,
  head: () => buildPageHead(TEMPLATE_BASE_PAGE_METADATA),
});
