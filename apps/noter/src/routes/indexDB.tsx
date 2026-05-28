import { createFileRoute } from "@tanstack/react-router";
import { IndexedDbWorkspacePage } from "@/components/IndexedDbWorkspacePage";
import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = INDEXED_DB_ROUTE;

function IndexedDbRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <IndexedDbWorkspacePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/indexDB")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: IndexedDbRouteComponent,
});
