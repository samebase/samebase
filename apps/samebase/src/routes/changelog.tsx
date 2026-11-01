import { createFileRoute } from "@tanstack/react-router";
import { DocsChangelogPage } from "@/components/LandingPreviewPage";
import {
  DOCS_CHANGELOG_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_CHANGELOG_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/changelog")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_CHANGELOG_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsChangelogPage,
  head: () => buildPageHead(DOCS_CHANGELOG_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
