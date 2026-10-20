import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { IndexedDbWorkspacePage } from "@/components/IndexedDbWorkspacePage";
import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = INDEXED_DB_ROUTE;

function IndexedDbRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <IndexedDbWorkspacePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/indexDB")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: IndexedDbRouteComponent,
});
