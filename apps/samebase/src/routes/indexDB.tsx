import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/appShell/AuthenticatedAppRoutePage";
import { IndexedDbWorkspacePage } from "@/browserStorage/IndexedDbWorkspacePage";
import { INDEXED_DB_ROUTE } from "@/browserStorage/indexedDbRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = INDEXED_DB_ROUTE;

function IndexedDbRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <IndexedDbWorkspacePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/indexDB")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: IndexedDbRouteComponent,
});
