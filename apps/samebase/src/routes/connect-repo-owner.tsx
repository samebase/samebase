import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ConnectRepository } from "@/components/ConnectRepository";
import { CONNECT_REPO_OWNER_ROUTE } from "@/lib/connectRepoRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function ConnectRepositoryOwnerRouteComponent() {
  const { owner } = Route.useParams();

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
