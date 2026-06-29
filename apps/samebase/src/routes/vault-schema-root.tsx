import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/vault/$owner/$repo/schema/$branch/root";

const VaultConvexSchemaGraphView = lazy(async () => {
  const module = await import("@/components/VaultConvexSchemaGraphView");
  return { default: module.VaultConvexSchemaGraphView };
});

function VaultSchemaRouteComponent() {
  const { branch, owner, repo } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <VaultConvexSchemaGraphView owner={owner} repoName={repo} branch={branch} appRoot="." />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/vault/$owner/$repo/schema/$branch/root")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: VaultSchemaRouteComponent,
});
