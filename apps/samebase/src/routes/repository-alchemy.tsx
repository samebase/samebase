import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { loadRepositoryOverview } from "@/routes/repository-dashboard.queries";

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
  loader: loadRepositoryOverview,
  // The loader's store token lasts five minutes and its read is one moment of the store, so the
  // route keeps no loader data after the page is left, and the next visit reads the store again.
  gcTime: 0,
  component: RepositoryAlchemyRouteComponent,
});
