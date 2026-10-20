import { AuthenticatedOrganizationRoutePage } from "@/organization/OrganizationRouteBoundary";
import { DashboardRoutePage } from "@/repository/dashboard/DashboardRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";
import { loadRepositoryDashboard } from "@/routes/repository-dashboard.queries";

export const Route = createFileRoute("/_authed/org/$owner/repositories")({
  loader: loadRepositoryDashboard,
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
