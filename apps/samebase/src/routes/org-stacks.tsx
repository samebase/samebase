import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedOrganizationRoutePage } from "@/organization/OrganizationRouteBoundary";
import { OrganizationStacksPage } from "@/organization/stacks/OrganizationStacksPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

export const Route = createFileRoute("/_authed/org/$owner/stacks")({
  component: OrganizationStacksRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/stacks"],
});

function OrganizationStacksRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <OrganizationStacksPage organization={organization} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
