import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { ProviderConnectionsPage } from "@/components/ProviderConnectionsPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { useAuthorizationErrorNotice } from "@/lib/useAuthorizationErrorNotice";
import { clearAuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { formatAuthorizationErrorMessage } from "@/lib/authorizationErrorMessage";

const PROVIDER_AUTHORIZATION_SOURCES = ["convex", "cloudflare", "github-app"] as const;

export const Route = createFileRoute("/org/$owner/providers")({
  component: OrganizationProvidersRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/providers"],
});

function OrganizationProvidersRoutePage() {
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
    allowedProviders: PROVIDER_AUTHORIZATION_SOURCES,
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
        <ProviderConnectionsPage
          authorizationError={authorizationError}
          organization={organization}
        />
      )}
    </AuthenticatedOrganizationRoutePage>
  );
}
