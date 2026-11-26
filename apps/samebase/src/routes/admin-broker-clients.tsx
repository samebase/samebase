import { createFileRoute } from "@tanstack/react-router";
import { AdminBrokerClientsPage } from "@/components/AdminBrokerClientsPage";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  ADMIN_BROKER_CLIENTS_ROUTE_SEARCH_STATIC_DATA,
  validateAdminBrokerClientsRouteSearch,
} from "@/routeSearch/brokerClients";

function AdminBrokerClientsRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AdminBrokerClientsPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/admin/broker-clients")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH["/admin/broker-clients"],
    ...ADMIN_BROKER_CLIENTS_ROUTE_SEARCH_STATIC_DATA,
  },
  validateSearch: validateAdminBrokerClientsRouteSearch,
  component: AdminBrokerClientsRouteComponent,
});
