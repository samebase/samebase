import { Navigate, createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ConnectRepository } from "@/components/ConnectRepository";
import { useGitHubOwnerRouteSelection } from "@/components/useGitHubOwnerRouteSelection";
import { CONNECT_REPO_OWNER_ROUTE, CONNECT_REPO_ROUTE } from "@/lib/connectRepoRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function ConnectRepositoryOwnerRouteComponent() {
  const { owner } = Route.useParams();
  const { githubOwners, selectedOwner } = useGitHubOwnerRouteSelection(owner);

  if (githubOwners?.length === 1 && selectedOwner === null) {
    return (
      <Navigate
        replace
        search
        to={CONNECT_REPO_OWNER_ROUTE}
        params={{ owner: githubOwners[0].githubOwnerLogin }}
      />
    );
  }

  if (githubOwners !== undefined && selectedOwner === null) {
    return <Navigate replace search to={CONNECT_REPO_ROUTE} />;
  }

  return (
    <AuthenticatedAppRoutePage>
      <ConnectRepository githubOwnerLogin={owner} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/connect-repo/$owner")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[CONNECT_REPO_OWNER_ROUTE],
  component: ConnectRepositoryOwnerRouteComponent,
});
