import type { VaultOverviewPageKind } from "@/components/vault-dashboard/VaultOverviewPage";
import type { VaultWorkspaceSelected } from "@/components/vault-dashboard/vaultWorkspaceModel";
import type {
  VaultSidebarSummariesState,
  VaultSidebarSummary,
} from "@/hooks/useVaultSidebarSummaries";
import { formatRepositoryCheckSummary, type RepositoryCheckSummary } from "@/lib/repositoryChecks";
import { buildVaultDashboardRoute, buildVaultSettingsRoute } from "@/lib/vaultRoutes";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";

function repositoryRoute(vault: UserVaultResult, page: VaultOverviewPageKind): string {
  const args = { owner: vault.ghRepoOwner, repoName: vault.ghRepoName };
  return page === "settings" ? buildVaultSettingsRoute(args) : buildVaultDashboardRoute(args);
}

function checkStateDotClassName(state: RepositoryCheckSummary["state"]): string {
  switch (state) {
    case "success":
      return "h-2 w-2 rounded-full bg-emerald-500";
    case "failure":
      return "h-2 w-2 rounded-full bg-red-500";
    case "running":
      return "h-2 w-2 rounded-full bg-amber-500";
    case "none":
    case "neutral":
    case "unknown":
      return "h-2 w-2 rounded-full bg-muted-foreground/60";
  }
  state satisfies never;
  return "h-2 w-2 rounded-full bg-muted-foreground/60";
}

function vaultSidebarStatus(args: {
  sidebarSummaries: VaultSidebarSummariesState;
  summary: VaultSidebarSummary | undefined;
  selected: boolean;
  vault: UserVaultResult;
  workspace: VaultWorkspaceSelected | null;
}): { kind: "dot"; dotClassName: string; label: string } | { kind: "workflow"; label: string } {
  if (args.vault.deletion.state === "delete_failed") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Delete failed",
    };
  }
  if (args.vault.sourceSetup.status === "failed" || args.vault.providerSetup.status === "failed") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Needs attention",
    };
  }
  if (args.vault.deletion.state === "deleting") {
    return { kind: "workflow", label: "Deleting" };
  }
  if (
    args.vault.sourceSetup.status === "running" ||
    args.vault.providerSetup.status === "running"
  ) {
    return { kind: "workflow", label: "Setting up" };
  }
  if (
    args.selected &&
    args.workspace &&
    (args.workspace.pullRequests.state === "current" ||
      args.workspace.pullRequests.state === "stale") &&
    args.workspace.pullRequests.defaultBranch
  ) {
    const checks = args.workspace.pullRequests.defaultBranch.checks;
    return {
      kind: "dot",
      dotClassName: checkStateDotClassName(checks.state),
      label: formatRepositoryCheckSummary(checks),
    };
  }
  if (args.summary) {
    return {
      kind: "dot",
      dotClassName: checkStateDotClassName(args.summary.checks.state),
      label: formatRepositoryCheckSummary(args.summary.checks),
    };
  }
  if (args.sidebarSummaries.state === "failed" || args.sidebarSummaries.state === "loaded") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-muted-foreground/50",
      label: "Checks unavailable",
    };
  }
  return {
    kind: "dot",
    dotClassName: "h-2 w-2 rounded-full bg-muted-foreground/50",
    label: "Loading checks",
  };
}

export function VaultOverviewSidebar({
  page,
  selectedVaultId,
  sidebarSummaries,
  vaults,
  workspace,
}: {
  page: VaultOverviewPageKind;
  selectedVaultId: UserVaultResult["_id"] | null;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[];
  workspace: VaultWorkspaceSelected | null;
}) {
  const summaryByVaultId = new Map(
    sidebarSummaries.state === "loaded"
      ? sidebarSummaries.summaries.map((summary) => [summary.vaultId, summary])
      : [],
  );

  return (
    <nav aria-label="Vaults" className="@container min-h-full py-2">
      {vaults.map((vault) => {
        const selected = vault._id === selectedVaultId;
        const summary = summaryByVaultId.get(vault._id);
        const status = vaultSidebarStatus({
          selected,
          sidebarSummaries,
          summary,
          vault,
          workspace,
        });

        return (
          <Link
            key={vault._id}
            aria-current={selected ? "page" : undefined}
            aria-label={vault.repositoryFullName}
            data-vault-status={status.label}
            className={
              selected
                ? "block min-w-0 bg-muted px-3 py-2.5 text-left no-underline hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
                : "block min-w-0 px-3 py-2.5 text-left no-underline hover:bg-muted/60 hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
            }
            title={vault.repositoryFullName}
            to={repositoryRoute(vault, page)}
          >
            <span className="block min-w-0 max-w-full text-sm leading-5">
              <span className="block min-w-0 truncate text-muted-foreground @max-[120px]:hidden">
                {vault.ghRepoOwner}/
              </span>
              <span className="block min-w-0 line-clamp-2 font-medium text-foreground [overflow-wrap:anywhere]">
                {vault.ghRepoName}
              </span>
            </span>
            <span className="mt-1 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-1 flex shrink-0">
                {status.kind === "workflow" ? (
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin text-amber-600" />
                ) : (
                  <span className={status.dotClassName} />
                )}
              </span>
              <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">{status.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function VaultOverviewSidebarLoading() {
  return (
    <div aria-label="Loading vaults" className="grid gap-4 px-3 py-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-2" aria-hidden="true">
          <div className="h-3 w-16 bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-28 max-w-full bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-24 max-w-full bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
