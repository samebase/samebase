import { createFileRoute } from "@tanstack/react-router";
import { AdminAccountDeletionsPage } from "@/components/AdminAccountDeletionsPage";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const ADMIN_ACCOUNT_DELETIONS_ROUTE = "/admin/account-deletions";

function AdminAccountDeletionsRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <AdminAccountDeletionsPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/admin/account-deletions")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[ADMIN_ACCOUNT_DELETIONS_ROUTE],
  component: AdminAccountDeletionsRouteComponent,
});
