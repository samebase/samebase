import { createFileRoute } from "@tanstack/react-router";
import { AdminUsersPage } from "@/admin/AdminUsersPage";
import { AuthenticatedAppRoutePage } from "@/appShell/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  ADMIN_USERS_ROUTE_SEARCH_STATIC_DATA,
  validateAdminUsersRouteSearch,
} from "@/routeSearch/adminUsers";

const ADMIN_USERS_ROUTE = "/admin/users";

function AdminUsersRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AdminUsersPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersRouteComponent,
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[ADMIN_USERS_ROUTE],
    ...ADMIN_USERS_ROUTE_SEARCH_STATIC_DATA,
  },
  validateSearch: validateAdminUsersRouteSearch,
});
