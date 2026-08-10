import { OrganizationMembersPage } from "@/components/OrganizationMembersPage";
import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/settings/members")({
  component: OrganizationMembersRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/settings/members"],
});

function OrganizationMembersRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <OrganizationMembersPage organization={organization} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
