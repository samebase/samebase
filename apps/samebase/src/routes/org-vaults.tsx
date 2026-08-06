import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { DashboardRoutePage } from "@/components/DashboardRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/vaults")({
  component: OrganizationVaultsRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/vaults"],
});

function OrganizationVaultsRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <DashboardRoutePage organizationOwner={organization.githubOwnerLogin} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
