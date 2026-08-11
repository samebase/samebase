import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedOrganizationRoutePage } from "@/components/OrganizationRouteBoundary";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/vault/$owner/$repo/db/$branch/project/$convexProjectId";

const VaultDatabaseView = lazy(async () => {
  const module = await import("@/components/VaultDatabaseView");
  return { default: module.VaultDatabaseView };
});

function VaultDatabaseRouteComponent() {
  const { branch, convexProjectId, owner, repo } = Route.useParams();

  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {() => (
        <VaultDatabaseView
          owner={owner}
          repoName={repo}
          branch={branch}
          convexProjectId={convexProjectId}
        />
      )}
    </AuthenticatedOrganizationRoutePage>
  );
}

export const Route = createFileRoute("/vault/$owner/$repo/db/$branch/project/$convexProjectId")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: VaultDatabaseRouteComponent,
});
