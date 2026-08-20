import { createFileRoute } from "@tanstack/react-router";
import { DocsCloudflareSetupPage } from "@/components/LandingPreviewPage";
import {
  DOCS_CLOUDFLARE_SETUP_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { buildPageHead, DOCS_CLOUDFLARE_SETUP_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/docs/cloudflare-setup")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_CLOUDFLARE_SETUP_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsCloudflareSetupPage,
  head: () => buildPageHead(DOCS_CLOUDFLARE_SETUP_PAGE_METADATA),
  validateSearch: validateDocsRouteSearch,
});
