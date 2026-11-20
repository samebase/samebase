import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { ResourceTypesPage } from "@/components/ResourceTypesPage";
import { buildPageHead, RESOURCE_TYPES_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/resource-types")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH["/resource-types"],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: ResourceTypesPage,
  head: () => buildPageHead(RESOURCE_TYPES_PAGE_METADATA),
});
