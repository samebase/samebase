import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/vault/$owner/$repo/db/$branch/root";

const VaultDatabaseView = lazy(async () => {
  const module = await import("@/components/VaultDatabaseView");
  return { default: module.VaultDatabaseView };
});

function VaultDatabaseRouteComponent() {
  const { branch, owner, repo } = Route.useParams();

  return (
    <AuthenticatedAppRoutePage>
      <VaultDatabaseView owner={owner} repoName={repo} branch={branch} appRoot="." />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/vault/$owner/$repo/db/$branch/root")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: VaultDatabaseRouteComponent,
});
