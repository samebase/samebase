import { createFileRoute } from "@tanstack/react-router";
import { LocalStorageWorkspacePage } from "@/components/LocalStorageWorkspacePage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

function LocalStorageRouteComponent() {
  return (
    <RoutedPage pathname="/localStorage">
      <LocalStorageWorkspacePage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/localStorage")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/localStorage"],
  component: LocalStorageRouteComponent,
});
