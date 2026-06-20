import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LocalStorageWorkspacePage } from "@/components/LocalStorageWorkspacePage";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = LOCAL_STORAGE_ROUTE;

function LocalStorageRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <LocalStorageWorkspacePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/localStorage")({
  staticData: SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: LocalStorageRouteComponent,
});
