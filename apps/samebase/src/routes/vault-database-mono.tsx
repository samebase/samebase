import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/vault/$owner/$repo/db/$branch/mono/$";

const VaultDatabaseView = lazy(async () => {
  const module = await import("@/components/VaultDatabaseView");
  return { default: module.VaultDatabaseView };
});

function VaultDatabaseRouteComponent() {
  const { _splat, branch, owner, repo } = Route.useParams();

  if (!_splat) {
    return <NotFoundRoutePage />;
  }

  return (
    <AuthenticatedAppRoutePage>
      <VaultDatabaseView owner={owner} repoName={repo} branch={branch} appRoot={_splat} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/vault/$owner/$repo/db/$branch/mono/$")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: VaultDatabaseRouteComponent,
});
