import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/repo/$owner/$repository/alchemy";

const RepositoryAlchemyStateView = lazy(async () => {
  const module = await import("@/components/RepositoryAlchemyStateView");
  return { default: module.RepositoryAlchemyStateView };
});

function RepositoryAlchemyRouteComponent() {
  const { owner, repository } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <RepositoryAlchemyStateView owner={owner} repoName={repository} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/_authed/repo/$owner/$repository/alchemy")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: RepositoryAlchemyRouteComponent,
});
