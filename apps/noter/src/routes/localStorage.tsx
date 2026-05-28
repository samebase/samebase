import { createFileRoute } from "@tanstack/react-router";
import { LocalStorageWorkspacePage } from "@/components/LocalStorageWorkspacePage";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = LOCAL_STORAGE_ROUTE;

function LocalStorageRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <LocalStorageWorkspacePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/localStorage")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: LocalStorageRouteComponent,
});
