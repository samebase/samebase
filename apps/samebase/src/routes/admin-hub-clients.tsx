import { createFileRoute } from "@tanstack/react-router";
import { AdminHubClientsPage } from "@/components/AdminHubClientsPage";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  ADMIN_HUB_CLIENTS_ROUTE_SEARCH_STATIC_DATA,
  validateAdminHubClientsRouteSearch,
} from "@/routeSearch/hubClients";

function AdminHubClientsRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AdminHubClientsPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/admin/hub-clients")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH["/admin/hub-clients"],
    ...ADMIN_HUB_CLIENTS_ROUTE_SEARCH_STATIC_DATA,
  },
  validateSearch: validateAdminHubClientsRouteSearch,
  component: AdminHubClientsRouteComponent,
});
