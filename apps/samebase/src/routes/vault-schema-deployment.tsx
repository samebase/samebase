import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/vault/$owner/$repo/schema/$branch/$deploymentId";

const VaultConvexSchemaGraphView = lazy(async () => {
  const module = await import("@/components/VaultConvexSchemaGraphView");
  return { default: module.VaultConvexSchemaGraphView };
});

function VaultSchemaRouteComponent() {
  const { branch, deploymentId, owner, repo } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <VaultConvexSchemaGraphView
        owner={owner}
        repoName={repo}
        branch={branch}
        deploymentId={deploymentId}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/vault/$owner/$repo/schema/$branch/$deploymentId")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: VaultSchemaRouteComponent,
});
