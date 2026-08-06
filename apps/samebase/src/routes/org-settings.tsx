import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { OrganizationSettingsPage } from "@/components/OrganizationSettingsPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  ORGANIZATION_BILLING_SEARCH_STATIC_DATA,
  validateOrganizationBillingSearch,
} from "@/routeSearch/organizationBilling";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/settings")({
  component: OrganizationSettingsRoutePage,
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/settings"],
    ...ORGANIZATION_BILLING_SEARCH_STATIC_DATA,
  },
  validateSearch: validateOrganizationBillingSearch,
});

function OrganizationSettingsRoutePage() {
  const { owner } = Route.useParams();
  const search = Route.useSearch();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <OrganizationSettingsPage organization={organization} search={search} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
