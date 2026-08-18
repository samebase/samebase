import { createFileRoute } from "@tanstack/react-router";
import { DocsCloudflareSetupPage } from "@/components/LandingPreviewPage";
import {
  DOCS_CLOUDFLARE_SETUP_ROUTE,
  DOCS_ROUTE_SEARCH_STATIC_DATA,
  validateDocsRouteSearch,
} from "@/routeSearch/landingPreview";
import { DOCS_CLOUDFLARE_SETUP_PAGE_METADATA } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function DocsCloudflareSetupRouteComponent() {
  usePageMetadata(DOCS_CLOUDFLARE_SETUP_PAGE_METADATA);

  return <DocsCloudflareSetupPage />;
}

export const Route = createFileRoute("/docs/cloudflare-setup")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[DOCS_CLOUDFLARE_SETUP_ROUTE],
    ...DOCS_ROUTE_SEARCH_STATIC_DATA,
  },
  component: DocsCloudflareSetupRouteComponent,
  validateSearch: validateDocsRouteSearch,
});
