import { createFileRoute } from "@tanstack/react-router";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { DocsChangelogPage } from "@/components/LandingPreviewPage";
import { DOCS_CHANGELOG_ROUTE } from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_CHANGELOG_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/changelog")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_CHANGELOG_ROUTE],
    appWorkspaceRouteChrome: DOCS_ROUTE_CHROME,
  },
  component: DocsChangelogPage,
  head: () => buildPageHead(DOCS_CHANGELOG_PAGE_METADATA),
});
