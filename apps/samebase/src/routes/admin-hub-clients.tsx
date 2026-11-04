import { createFileRoute } from "@tanstack/react-router";
import { AdminHubClientsPage } from "@/components/AdminHubClientsPage";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function AdminHubClientsRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AdminHubClientsPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/admin/hub-clients")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/admin/hub-clients"],
  component: AdminHubClientsRouteComponent,
});
