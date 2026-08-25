import { createFileRoute } from "@tanstack/react-router";
import { PublicLinksPage } from "@/components/PublicLinksPage";
import { buildPageHead, LINKS_PAGE_METADATA } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/links";

function LinksRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <PublicLinksPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/links")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: LinksRouteComponent,
  head: () => buildPageHead(LINKS_PAGE_METADATA),
});
