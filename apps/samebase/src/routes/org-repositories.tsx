import { AuthenticatedOrganizationRoutePage } from "@/organization/OrganizationRouteBoundary";
import { DashboardRoutePage } from "@/repository/dashboard/DashboardRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/repositories")({
  component: OrganizationRepositoriesRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/repositories"],
});

function OrganizationRepositoriesRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <DashboardRoutePage organizationOwner={organization.githubOwnerLogin} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
