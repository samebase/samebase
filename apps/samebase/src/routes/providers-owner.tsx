import { Navigate, createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ProviderConnectionsPage } from "@/components/ProviderConnectionsPage";
import { useGitHubOwnerRouteSelection } from "@/components/useGitHubOwnerRouteSelection";
import { PROVIDERS_OWNER_ROUTE, PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function ProvidersOwnerRouteComponent() {
  const { owner } = Route.useParams();
  const { githubOwners, selectedOwner } = useGitHubOwnerRouteSelection(owner);

  if (githubOwners?.length === 1 && selectedOwner === null) {
    return (
      <Navigate
        replace
        search
        to={PROVIDERS_OWNER_ROUTE}
        params={{ owner: githubOwners[0].githubOwnerLogin }}
      />
    );
  }

  if (githubOwners !== undefined && selectedOwner === null) {
    return <Navigate replace search to={PROVIDERS_ROUTE} />;
  }

  return (
    <AuthenticatedAppRoutePage>
      <ProviderConnectionsPage githubOwnerLogin={owner} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/providers/$owner")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[PROVIDERS_OWNER_ROUTE],
  component: ProvidersOwnerRouteComponent,
});
