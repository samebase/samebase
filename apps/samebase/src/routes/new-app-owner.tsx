import { Navigate, createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { NewAppPage } from "@/components/NewAppPage";
import { useGitHubOwnerRouteSelection } from "@/components/useGitHubOwnerRouteSelection";
import { NEW_APP_OWNER_ROUTE, NEW_APP_ROUTE } from "@/lib/newAppRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function NewAppOwnerRouteComponent() {
  const { owner } = Route.useParams();
  const { githubOwners, selectedOwner } = useGitHubOwnerRouteSelection(owner);

  if (githubOwners?.length === 1 && selectedOwner === null) {
    return (
      <Navigate
        replace
        search
        to={NEW_APP_OWNER_ROUTE}
        params={{ owner: githubOwners[0].githubOwnerLogin }}
      />
    );
  }

  if (githubOwners !== undefined && selectedOwner === null) {
    return <Navigate replace search to={NEW_APP_ROUTE} />;
  }

  return (
    <AuthenticatedAppRoutePage>
      <NewAppPage githubOwnerLogin={owner} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/new-app/$owner")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[NEW_APP_OWNER_ROUTE],
  component: NewAppOwnerRouteComponent,
});
