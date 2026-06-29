import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/vault/$owner/$repo/schema/$branch/mono/$";

const VaultConvexSchemaGraphView = lazy(async () => {
  const module = await import("@/components/VaultConvexSchemaGraphView");
  return { default: module.VaultConvexSchemaGraphView };
});

function VaultSchemaRouteComponent() {
  const { _splat, branch, owner, repo } = Route.useParams();

  if (!_splat) {
    return <NotFoundRoutePage />;
  }

  return (
    <AuthenticatedAppRoutePage>
      <VaultConvexSchemaGraphView owner={owner} repoName={repo} branch={branch} appRoot={_splat} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/vault/$owner/$repo/schema/$branch/mono/$")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: VaultSchemaRouteComponent,
});
