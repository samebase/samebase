import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/repo/$owner/$repository/db/$branch/project/$convexProjectId";

const RepositoryDatabaseView = lazy(async () => {
  const module = await import("@/components/RepositoryDatabaseView");
  return { default: module.RepositoryDatabaseView };
});

function RepositoryDatabaseRouteComponent() {
  const { branch, convexProjectId, owner, repository } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <RepositoryDatabaseView
        owner={owner}
        repoName={repository}
        branch={branch}
        convexProjectId={convexProjectId}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute(
  "/_authed/repo/$owner/$repository/db/$branch/project/$convexProjectId",
)({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RepositoryDatabaseRouteComponent,
});
