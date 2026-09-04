import { AuthenticatedOrganizationRoutePage } from "@/organization/OrganizationRouteBoundary";
import { NewAppPage } from "@/components/NewAppPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/new-app")({
  component: OrganizationNewAppRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/new-app"],
});

function OrganizationNewAppRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <NewAppPage organization={organization} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
