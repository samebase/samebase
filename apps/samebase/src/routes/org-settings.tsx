import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { OrganizationSettingsPage } from "@/components/OrganizationSettingsPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  ORGANIZATION_BILLING_SEARCH_STATIC_DATA,
  POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
  validateOrganizationBillingSearch,
} from "@/routeSearch/organizationBilling";
import { applySearchPatch } from "@/routing/searchFlags";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$owner/settings")({
  beforeLoad: ({ search }) => {
    if (search[POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM] !== true) {
      return;
    }

    throw redirect({
      hash: true,
      replace: true,
      search: applySearchPatch(search, {
        [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: null,
      }),
      to: ".",
    });
  },
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
