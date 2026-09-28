import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/appShell/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/repo/$owner/$repository/schema/$branch/project/$convexProjectId";

const RepositoryConvexSchemaGraphView = lazy(async () => {
  const module = await import("@/repository/schemaGraph/RepositoryConvexSchemaGraphView");
  return { default: module.RepositoryConvexSchemaGraphView };
});

function RepositorySchemaRouteComponent() {
  const { branch, convexProjectId, owner, repository } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <RepositoryConvexSchemaGraphView
        owner={owner}
        repoName={repository}
        branch={branch}
        convexProjectId={convexProjectId}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute(
  "/repo/$owner/$repository/schema/$branch/project/$convexProjectId",
)({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RepositorySchemaRouteComponent,
});
