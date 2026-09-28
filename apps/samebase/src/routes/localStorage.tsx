import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/appShell/AuthenticatedAppRoutePage";
import { LocalStorageWorkspacePage } from "@/browserStorage/LocalStorageWorkspacePage";
import { LOCAL_STORAGE_ROUTE } from "@/browserStorage/localStorageRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = LOCAL_STORAGE_ROUTE;

function LocalStorageRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <LocalStorageWorkspacePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/localStorage")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: LocalStorageRouteComponent,
});
