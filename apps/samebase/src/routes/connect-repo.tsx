import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ConnectRepository } from "@/components/ConnectRepository";
import { CONNECT_REPO_ROUTE } from "@/lib/connectRepoRoute";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

function ConnectRepositoryRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <ConnectRepository />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/connect-repo")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[CONNECT_REPO_ROUTE],
  component: ConnectRepositoryRouteComponent,
});
