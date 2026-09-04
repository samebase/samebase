import { AuthenticatedOrganizationRoutePage } from "@/organization/OrganizationRouteBoundary";
import { ConnectRepository } from "@/components/ConnectRepository";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/connect-repo")({
  component: OrganizationConnectRepositoryRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/connect-repo"],
});

function OrganizationConnectRepositoryRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <ConnectRepository organization={organization} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
