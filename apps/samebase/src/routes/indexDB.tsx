import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { IndexedDbWorkspacePage } from "@/components/IndexedDbWorkspacePage";
import { INDEXED_DB_ROUTE } from "@/lib/indexedDbRoute";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = INDEXED_DB_ROUTE;

function IndexedDbRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <IndexedDbWorkspacePage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/indexDB")({
  staticData: NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: IndexedDbRouteComponent,
});
