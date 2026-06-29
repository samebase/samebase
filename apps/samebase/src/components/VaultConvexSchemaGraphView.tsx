import { api } from "../../convex/_generated/api";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { VaultConvexSchemaGraph } from "@/components/vault-dashboard/VaultConvexSchemaGraph";
import { useCacheQuery as useVaultQuery } from "@/lib/convexQueryCache";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type VaultConvexSchemaGraphViewProps = {
  appRoot: string;
  branch: string;
  owner: string;
  repoName: string;
};

function VaultConvexSchemaGraphRouteStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function VaultConvexSchemaGraphView({
  appRoot,
  branch,
  owner,
  repoName,
}: VaultConvexSchemaGraphViewProps) {
  const repositoryFullName = `${owner}/${repoName}`;
  const vault = useVaultQuery(api.vault.records.getVaultByRepository, {
    repositoryFullName,
    branch,
  });

  return (
    <AppWorkspaceRouteChrome leftToggleVisibility="all" rightToggleVisibility="all">
      <div data-testid="vault-schema-page" className="flex h-full min-h-0 flex-col bg-background">
        {vault === undefined ? (
          <VaultConvexSchemaGraphRouteStatus>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading schema
          </VaultConvexSchemaGraphRouteStatus>
        ) : vault === null ? (
          <VaultConvexSchemaGraphRouteStatus>Vault not found.</VaultConvexSchemaGraphRouteStatus>
        ) : vault.branchNotFound ? (
          <VaultConvexSchemaGraphRouteStatus>
            Convex schema is not available for this branch.
          </VaultConvexSchemaGraphRouteStatus>
        ) : (
          <VaultConvexSchemaGraph appRoot={appRoot} vaultId={vault._id} variant="route" />
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
