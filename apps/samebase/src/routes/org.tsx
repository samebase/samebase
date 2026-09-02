import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { ORGANIZATION_REPOSITORIES_ROUTE } from "@/lib/organizationRoutes";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner")({
  component: OrganizationIndexRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner"],
});

function OrganizationIndexRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => (
        <Navigate
          params={{ owner: organization.githubOwnerLogin }}
          replace
          search
          to={ORGANIZATION_REPOSITORIES_ROUTE}
        />
      )}
    </AuthenticatedOrganizationRoutePage>
  );
}
