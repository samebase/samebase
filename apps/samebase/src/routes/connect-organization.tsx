import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import { ConnectOrganizationPage } from "@/components/ConnectOrganizationPage";
import { CONNECT_ORGANIZATION_ROUTE } from "@/lib/connectOrganizationRoute";
import { useAuthorizationErrorNotice } from "@/lib/useAuthorizationErrorNotice";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import {
  CONNECT_ORGANIZATION_ROUTE_SEARCH_STATIC_DATA,
  GITHUB_CONNECTION_SESSION_QUERY_PARAM,
  validateConnectOrganizationRouteSearch,
} from "@/routeSearch/connectOrganization";

const CONNECT_ORGANIZATION_AUTHORIZATION_SOURCES = ["github-app", "github-user"] as const;

function ConnectOrganizationRouteComponent() {
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
    allowedProviders: CONNECT_ORGANIZATION_AUTHORIZATION_SOURCES,
    onConsume: consumeAuthorizationError,
    search,
    scopeKey: "connect-organization",
  });
  const authorizationNotice = authorizationError ? (
    <AuthorizationErrorNotice>
      {authorizationError.code === "expired"
        ? "GitHub authorization expired. Authorize GitHub again."
        : authorizationError.code === "canceled"
          ? "GitHub authorization was canceled."
          : authorizationError.code === "access-changed"
            ? "You no longer have permission to connect an organization."
            : "GitHub authorization failed. Try again."}
    </AuthorizationErrorNotice>
  ) : null;

  return (
    <AuthenticatedAppRoutePage>
      <ConnectOrganizationPage
        authorizationNotice={authorizationNotice}
        session={search[GITHUB_CONNECTION_SESSION_QUERY_PARAM]}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/connect-organization")({
  component: ConnectOrganizationRouteComponent,
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[CONNECT_ORGANIZATION_ROUTE],
    ...CONNECT_ORGANIZATION_ROUTE_SEARCH_STATIC_DATA,
  },
  validateSearch: validateConnectOrganizationRouteSearch,
});
