import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { ProviderConnectionsPage } from "@/components/ProviderConnectionsPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/providers")({
  component: OrganizationProvidersRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/providers"],
});

function OrganizationProvidersRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <ProviderConnectionsPage organization={organization} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
