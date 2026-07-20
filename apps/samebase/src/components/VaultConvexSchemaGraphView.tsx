import { api } from "../../convex/_generated/api";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import {
  VaultConvexSchemaGraphRouteWorkspace,
  type VaultConvexSchemaGraphRouteContext,
} from "@/components/vault-dashboard/VaultConvexSchemaGraph";
import { useCacheQuery as useVaultQuery } from "@/lib/convexQueryCache";
import { Database, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type VaultConvexSchemaGraphViewProps = {
  appRoot: string;
  branch: string;
  owner: string;
  repoName: string;
};

function VaultConvexSchemaGraphRouteStatusSidebar({
  context,
  status,
}: {
  context: VaultConvexSchemaGraphRouteContext;
  status: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-2 py-2 text-sm">
      <div className="grid min-w-0 gap-1 border-b border-border/60 pb-3">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">Convex schema</span>
        </div>
        <div className="min-w-0 truncate text-xs text-muted-foreground">
          {context.repositoryFullName}
        </div>
        <div className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {context.branch}
        </div>
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <div className="flex min-w-0 justify-between gap-2">
          <span>App root</span>
          <span className="min-w-0 truncate font-mono text-foreground">{context.appRoot}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">{status}</div>
    </div>
  );
}

function VaultConvexSchemaGraphRouteStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-3 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function VaultConvexSchemaGraphRouteStatusShell({
  context,
  status,
}: {
  context: VaultConvexSchemaGraphRouteContext;
  status: ReactNode;
}) {
  return (
    <AppWorkspaceRouteChrome
      left={{
        content: <VaultConvexSchemaGraphRouteStatusSidebar context={context} status={status} />,
      }}
      leftToggleVisibility="all"
      rightToggleVisibility="all"
    >
      <div data-testid="vault-schema-page" className="flex h-full min-h-0 flex-col bg-background">
        <VaultConvexSchemaGraphRouteStatus>{status}</VaultConvexSchemaGraphRouteStatus>
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function VaultConvexSchemaGraphView({
  appRoot,
  branch,
  owner,
  repoName,
}: VaultConvexSchemaGraphViewProps) {
  const repositoryFullName = `${owner}/${repoName}`;
  const context = {
    appRoot,
    branch,
    repositoryFullName,
  } satisfies VaultConvexSchemaGraphRouteContext;
  const vault = useVaultQuery(api.vault.records.getVaultByRepository, {
    repositoryFullName,
    branch,
  });

  if (vault === undefined) {
    return (
      <VaultConvexSchemaGraphRouteStatusShell
        context={context}
        status={
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading schema
          </>
        }
      />
    );
  }

  if (vault === null) {
    return <VaultConvexSchemaGraphRouteStatusShell context={context} status="Vault not found." />;
  }

  return <VaultConvexSchemaGraphRouteWorkspace context={context} vaultId={vault._id} />;
}
