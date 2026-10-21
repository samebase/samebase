import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/repo/$owner/$repository/alchemy/$deploymentName";

const RepositoryAlchemyStateView = lazy(async () => {
  const module = await import("@/components/RepositoryAlchemyStateView");
  return { default: module.RepositoryAlchemyStateView };
});

function RepositoryAlchemyRouteComponent() {
  const { deploymentName, owner, repository } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <RepositoryAlchemyStateView
        owner={owner}
        repoName={repository}
        deploymentName={deploymentName}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/repo/$owner/$repository/alchemy/$deploymentName")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RepositoryAlchemyRouteComponent,
});
