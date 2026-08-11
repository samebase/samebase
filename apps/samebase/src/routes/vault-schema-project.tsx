import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/vault/$owner/$repo/schema/$branch/project/$convexProjectId";

const VaultConvexSchemaGraphView = lazy(async () => {
  const module = await import("@/components/VaultConvexSchemaGraphView");
  return { default: module.VaultConvexSchemaGraphView };
});

function VaultSchemaRouteComponent() {
  const { branch, convexProjectId, owner, repo } = Route.useParams();

  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {() => (
        <VaultConvexSchemaGraphView
          owner={owner}
          repoName={repo}
          branch={branch}
          convexProjectId={convexProjectId}
        />
      )}
    </AuthenticatedOrganizationRoutePage>
  );
}

export const Route = createFileRoute("/vault/$owner/$repo/schema/$branch/project/$convexProjectId")(
  {
    staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    component: VaultSchemaRouteComponent,
  },
);
