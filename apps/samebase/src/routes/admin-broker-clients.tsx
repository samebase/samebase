import { createFileRoute } from "@tanstack/react-router";
import { AdminBrokerClientsPage } from "@/components/AdminBrokerClientsPage";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function AdminBrokerClientsRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AdminBrokerClientsPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/admin/broker-clients")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/admin/broker-clients"],
  component: AdminBrokerClientsRouteComponent,
});
