import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import { OrganizationsPage } from "@/organization/OrganizationsPage";
import { formatAuthorizationErrorMessage } from "@/lib/authorizationErrorMessage";
import { ORGANIZATIONS_ROUTE } from "@/organization/organizationRoutes";
import { useAuthorizationErrorNotice } from "@/lib/useAuthorizationErrorNotice";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";

const ORGANIZATIONS_AUTHORIZATION_SOURCES = ["github-app", "github-user"] as const;

function OrganizationsRouteComponent() {
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
    allowedProviders: ORGANIZATIONS_AUTHORIZATION_SOURCES,
    onConsume: consumeAuthorizationError,
    search,
    scopeKey: "organizations",
  });
  const authorizationNotice = authorizationError ? (
    <AuthorizationErrorNotice>
      {formatAuthorizationErrorMessage(authorizationError)}
    </AuthorizationErrorNotice>
  ) : null;

  return (
    <AuthenticatedAppRoutePage>
      <OrganizationsPage authorizationNotice={authorizationNotice} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/org")({
  component: OrganizationsRouteComponent,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[ORGANIZATIONS_ROUTE],
});
