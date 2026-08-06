import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { OrganizationSettingsPage } from "@/components/OrganizationSettingsPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/settings")({
  component: OrganizationSettingsRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/settings"],
});

function OrganizationSettingsRoutePage() {
  const { owner } = Route.useParams();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <OrganizationSettingsPage organization={organization} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
