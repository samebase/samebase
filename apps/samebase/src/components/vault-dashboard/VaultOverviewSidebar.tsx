import type { VaultOverviewPageKind } from "@/components/vault-dashboard/VaultOverviewPage";
import type {
  VaultOrganization,
  VaultWorkspaceSelected,
} from "@/components/vault-dashboard/vaultWorkspaceModel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type {
  VaultSidebarSummariesState,
  VaultSidebarSummary,
} from "@/hooks/useVaultSidebarSummaries";
import { ChevronDownIcon } from "@/lib/radixIcons";
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
}

type VaultSidebarStatus =
  | { kind: "dot" | "failure"; dotClassName: string; label: string }
  | { kind: "workflow"; label: string };

function vaultSidebarStatus(args: {
  sidebarSummaries: VaultSidebarSummariesState;
  summary: VaultSidebarSummary | undefined;
  selected: boolean;
  vault: UserVaultResult;
  workspace: VaultWorkspaceSelected | null;
}): VaultSidebarStatus {
  if (args.vault.deletion.state === "deleting") {
    return { kind: "workflow", label: "Deleting" };
  }
  if (
    args.vault.sourceSetup.status === "running" ||
    args.vault.providerSetup.status === "running"
  ) {
    return { kind: "workflow", label: "Setting up" };
  }
  if (args.vault.deletion.state === "delete_failed") {
    return {
      kind: "failure",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Delete failed",
    };
  }
  if (args.vault.sourceSetup.status === "failed" || args.vault.providerSetup.status === "failed") {
    return {
      kind: "failure",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Needs attention",
    };
  }
  const checks =
    args.selected &&
    args.workspace &&
    (args.workspace.pullRequests.state === "current" ||
      args.workspace.pullRequests.state === "stale") &&
    args.workspace.pullRequests.defaultBranch
      ? args.workspace.pullRequests.defaultBranch.checks
      : args.summary?.checks;

  if (checks) {
    return {
      kind: checks.state === "failure" ? "failure" : "dot",
      dotClassName: checkStateDotClassName(checks.state),
      label: formatRepositoryCheckSummary(checks),
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

function VaultRow({
  page,
  selected,
  sidebarSummaries,
  summary,
  vault,
  workspace,
  showOwner,
}: {
  page: VaultOverviewPageKind;
  selected: boolean;
  sidebarSummaries: VaultSidebarSummariesState;
  summary: VaultSidebarSummary | undefined;
  vault: UserVaultResult;
  workspace: VaultWorkspaceSelected | null;
  showOwner: boolean;
}) {
  const status = vaultSidebarStatus({ selected, sidebarSummaries, summary, vault, workspace });
  const rowClassName = selected
    ? "min-w-0 bg-muted @max-[200px]:px-1"
    : "min-w-0 hover:bg-muted/60 @max-[200px]:px-1";

  return (
    <div className={rowClassName}>
      <Link
        aria-current={selected ? "page" : undefined}
        aria-label={`${vault.repositoryFullName}, ${status.label}`}
        className="block min-w-0 px-3 py-2.5 text-left no-underline hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
        data-vault-status={status.label}
        title={vault.repositoryFullName}
        to={repositoryRoute(vault, page)}
      >
        <span className="block min-w-0 max-w-full text-sm leading-5">
          {showOwner ? (
            <span className="block min-w-0 truncate text-muted-foreground @max-[120px]:hidden">
              {vault.ghRepoOwner}/
            </span>
          ) : null}
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
    </div>
  );
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
      {vaults.map((vault) => (
        <VaultRow
          key={vault._id}
          page={page}
          selected={vault._id === selectedVaultId}
          sidebarSummaries={sidebarSummaries}
          summary={summaryByVaultId.get(vault._id)}
          vault={vault}
          workspace={workspace}
          showOwner
        />
      ))}
    </nav>
  );
}

export function VaultOverviewOrganizationSidebar({
  organizations,
  page,
  selectedVaultId,
  sidebarSummaries,
  vaults,
  workspace,
}: {
  organizations: readonly VaultOrganization[];
  page: VaultOverviewPageKind;
  selectedVaultId: UserVaultResult["_id"] | null;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[];
  workspace: VaultWorkspaceSelected | null;
}) {
  const selectedOrganizationId = vaults.find(
    (vault) => vault._id === selectedVaultId,
  )?.organizationId;
  const summaryByVaultId = new Map(
    sidebarSummaries.state === "loaded"
      ? sidebarSummaries.summaries.map((summary) => [summary.vaultId, summary])
      : [],
  );

  return (
    <nav aria-label="Vaults" className="@container min-h-full py-2">
      {organizations.map((organization) => {
        const organizationVaults = vaults.filter(
          (vault) => vault.organizationId === organization.organizationId,
        );
        const selected = organization.organizationId === selectedOrganizationId;

        return (
          <Collapsible key={`${organization.organizationId}:${selected}`} defaultOpen={selected}>
            <CollapsibleTrigger
              className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/60 @max-[200px]:px-2 @max-[120px]:px-1 [&[data-state=open]>svg]:rotate-180"
              nativeButton
              type="button"
            >
              <span className="min-w-0 truncate">{organization.githubOwnerLogin}</span>
              <ChevronDownIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 transition-transform"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {organizationVaults.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground @max-[200px]:px-2 @max-[120px]:px-1">
                  No vaults
                </p>
              ) : (
                organizationVaults.map((vault) => (
                  <VaultRow
                    key={vault._id}
                    page={page}
                    selected={vault._id === selectedVaultId}
                    sidebarSummaries={sidebarSummaries}
                    summary={summaryByVaultId.get(vault._id)}
                    vault={vault}
                    workspace={workspace}
                    showOwner={false}
                  />
                ))
              )}
            </CollapsibleContent>
          </Collapsible>
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
