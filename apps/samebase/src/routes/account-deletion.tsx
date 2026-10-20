import { createFileRoute } from "@tanstack/react-router";
import { AccountDeletionPage } from "@/account/AccountDeletionPage";
import { AuthenticatedUserRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ACCOUNT_DELETION_ROUTE } from "@/account/accountDeletionRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function AccountDeletionRouteComponent() {
  return (
    <AuthenticatedUserRoutePage>
      <AccountDeletionPage />
    </AuthenticatedUserRoutePage>
  );
}

export const Route = createFileRoute("/_authed/account-deletion")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[ACCOUNT_DELETION_ROUTE],
  component: AccountDeletionRouteComponent,
});
