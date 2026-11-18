import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { TemplateIdentityHubPage } from "@/components/TemplatesPage";
import { TEMPLATE_IDENTITY_HUB_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, TEMPLATE_IDENTITY_HUB_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/templates/identity-hub")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[TEMPLATE_IDENTITY_HUB_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: TemplateIdentityHubPage,
  head: () => buildPageHead(TEMPLATE_IDENTITY_HUB_PAGE_METADATA),
});
