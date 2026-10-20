import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/repo/$owner/$repository/components/$deploymentName";

const RepositoryConvexComponentsView = lazy(async () => {
  const module = await import("@/components/RepositoryConvexComponentsView");
  return { default: module.RepositoryConvexComponentsView };
});

function RepositoryComponentsRouteComponent() {
  const { deploymentName, owner, repository } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <RepositoryConvexComponentsView
        owner={owner}
        repoName={repository}
        deploymentName={deploymentName}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/repo/$owner/$repository/components/$deploymentName")(
  {
    staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    component: RepositoryComponentsRouteComponent,
  },
);
