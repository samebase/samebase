import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/repo/$owner/$repository/components/project/$convexProjectId";

const RepositoryConvexComponentsView = lazy(async () => {
  const module = await import("@/components/RepositoryConvexComponentsView");
  return { default: module.RepositoryConvexComponentsView };
});

function RepositoryComponentsRouteComponent() {
  const { convexProjectId, owner, repository } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <RepositoryConvexComponentsView
        owner={owner}
        repoName={repository}
        convexProjectId={convexProjectId}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute(
  "/repo/$owner/$repository/components/project/$convexProjectId",
)({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RepositoryComponentsRouteComponent,
});
