import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { OrganizationBillingPage } from "@/components/OrganizationBillingPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  ORGANIZATION_BILLING_ROUTE_SEARCH_STATIC_DATA,
  validateOrganizationBillingRouteSearch,
} from "@/routeSearch/organizationBilling";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/settings/billing")({
  component: OrganizationBillingRoutePage,
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/settings/billing"],
    ...ORGANIZATION_BILLING_ROUTE_SEARCH_STATIC_DATA,
  },
  validateSearch: validateOrganizationBillingRouteSearch,
});

function OrganizationBillingRoutePage() {
  const { owner } = Route.useParams();
  const search = Route.useSearch();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => <OrganizationBillingPage organization={organization} search={search} />}
    </AuthenticatedOrganizationRoutePage>
  );
}
