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
import { useAuthorizationErrorNotice } from "@/lib/useAuthorizationErrorNotice";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import { useCallback } from "react";
import { formatAuthorizationErrorMessage } from "@/lib/authorizationErrorMessage";

const GITHUB_APP_AUTHORIZATION_SOURCE = ["github-app"] as const;

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
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const consumeAuthorizationError = useCallback(() => {
    void navigate({
      hash: true,
      replace: true,
      resetScroll: false,
      search: clearAuthorizationErrorSearch,
      to: ".",
    });
  }, [navigate]);
  const authorizationError = useAuthorizationErrorNotice({
    allowedProviders: GITHUB_APP_AUTHORIZATION_SOURCE,
    onConsume: consumeAuthorizationError,
    search,
    scopeKey: owner,
  });
  const unavailableAuthorizationErrorMessage = authorizationError
    ? formatAuthorizationErrorMessage(authorizationError)
    : null;
  return (
    <AuthenticatedOrganizationRoutePage
      authorizationErrorMessage={unavailableAuthorizationErrorMessage}
      owner={owner}
    >
      {(organization) => (
        <OrganizationSettingsPage
          authorizationError={authorizationError}
          organization={organization}
          search={search}
        />
      )}
    </AuthenticatedOrganizationRoutePage>
  );
}
