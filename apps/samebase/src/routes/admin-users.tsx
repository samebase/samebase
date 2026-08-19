import { createFileRoute } from "@tanstack/react-router";
import { AdminUsersPage } from "@/components/AdminUsersPage";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const ADMIN_USERS_ROUTE = "/admin/users";

function AdminUsersRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AdminUsersPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/admin/users")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[ADMIN_USERS_ROUTE],
  component: AdminUsersRouteComponent,
});
