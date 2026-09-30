import { createFileRoute } from "@tanstack/react-router";
import { DocsCloudflarePreviewsMigrationPage } from "@/components/LandingPreviewPage";
import {
  DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import {
  buildPageHead,
  DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_PAGE_METADATA,
} from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/cloudflare-previews-migration")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsCloudflarePreviewsMigrationPage,
  head: () => buildPageHead(DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
