import { UpdateIcon } from "@/lib/radixIcons";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { RepositoryInventoryCheckSummary } from "../../convex/repositoryInventoryModel";
import { useNow } from "@/hooks/useNow";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  formatRelativeTimeAgoWithSeconds,
  formatRelativeTimeUntil,
} from "@/lib/formatRelativeTime";
import { getTreeRefreshUiState } from "@/lib/treeRefreshStatus";
import { cn } from "@/lib/utils";
import { EditedFilesCategoriesPopover } from "./EditedFilesCategories";
import { linkStyle } from "./styles";

export type VaultSyncStatusStagedFile = NonNullable<
  (typeof api.fileStaging.listStagedFiles)["_returnType"]
>[number];

type VaultSyncStatusSharedProps = {
  repositoryFullName: string;
  branch: string;
  commitSha?: string;
  treeRefreshStartedAt?: number;
  lastTreeRefreshAt?: number;
  lastTreeRefreshFailedAt?: number;
  treeRefreshFailureKind?: "failed" | "rate_limited";
  treeRefreshFailureMessage?: string;
  treeRefreshCooldownUntil?: number;
  checks?: RepositoryInventoryCheckSummary;
  stagedFiles?: VaultSyncStatusStagedFile[];
  now?: number;
  className?: string;
};

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatChecksLabel(summary: RepositoryInventoryCheckSummary): string {
  if (summary.totalCount === 0) {
    return "No checks";
  }

  switch (summary.state) {
    case "running":
      return `${summary.runningCount} pending`;
    case "failure":
      return `${summary.failureCount} failed`;
    case "success":
      return `${summary.successCount} passed`;
    case "neutral":
      return `${summary.neutralCount} neutral`;
    case "unknown":
      return `${summary.unknownCount} unknown`;
    default: {
      summary.state satisfies never;
      return "Checks";
    }
  }
}

function formatChecksTitle(summary: RepositoryInventoryCheckSummary): string {
  return [
    `${formatCount(summary.totalCount, "check")} total`,
    formatCount(summary.checkRunCount, "check run"),
    formatCount(summary.statusContextCount, "status context"),
    `${summary.successCount} passed`,
    `${summary.failureCount} failed`,
    `${summary.runningCount} pending`,
    `${summary.neutralCount} neutral`,
    `${summary.unknownCount} unknown`,
  ].join(" • ");
}

function getChecksClassName(summary: RepositoryInventoryCheckSummary): string {
  switch (summary.state) {
    case "success":
      return "text-emerald-600";
    case "failure":
      return "text-red-600";
    case "running":
      return "text-amber-600";
    case "neutral":
    case "unknown":
      return "text-muted-foreground";
    default: {
      summary.state satisfies never;
      return "text-muted-foreground";
    }
  }
}

function RepositoryInventoryChecks({ summary }: { summary: RepositoryInventoryCheckSummary }) {
  const label = formatChecksLabel(summary);
  const title = formatChecksTitle(summary);
  const className = cn("mr-1 font-mono", getChecksClassName(summary));

  return summary.primaryTargetUrl ? (
    <a
      className={cn(className, "hover:underline")}
      href={summary.primaryTargetUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
    >
      {label}
    </a>
  ) : (
    <span className={className} title={title} aria-label={title}>
      {label}
    </span>
  );
}

export function VaultSyncStatusContent({
  repositoryFullName,
  branch,
  commitSha,
  treeRefreshStartedAt,
  lastTreeRefreshAt,
  lastTreeRefreshFailedAt,
  treeRefreshFailureKind,
  treeRefreshFailureMessage,
  treeRefreshCooldownUntil,
  checks,
  stagedFiles = [],
  now: nowFromParent,
  className,
}: VaultSyncStatusSharedProps) {
  const fallbackNow = useNow({ enabled: nowFromParent === undefined });
  const now = nowFromParent ?? fallbackNow;
  const commitUrl = commitSha
    ? `https://github.com/${repositoryFullName}/commit/${commitSha}`
    : null;
  const treeRefreshUiState = getTreeRefreshUiState({
    now,
    treeRefreshStartedAt,
    lastTreeRefreshAt,
    lastTreeRefreshFailedAt,
    treeRefreshFailureKind,
    treeRefreshCooldownUntil,
  });
  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {stagedFiles.length > 0 && (
        <EditedFilesCategoriesPopover
          repositoryFullName={repositoryFullName}
          branch={branch}
          stagedFiles={stagedFiles}
        />
      )}

      <span className="inline-flex items-center gap-1">
        {treeRefreshUiState.kind === "syncing" && (
          <>
            <span className="inline-flex items-center gap-1">
              <UpdateIcon className="animate-spin" />
              Syncing…
            </span>
            <span>·</span>
          </>
        )}
        {treeRefreshUiState.kind === "rate_limited" && (
          <>
            <span
              className="inline-flex items-center gap-1 text-amber-700"
              title={treeRefreshFailureMessage ?? "GitHub API rate limited. Auto-refresh paused."}
            >
              <span>GitHub rate limited</span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                {formatRelativeTimeUntil(treeRefreshUiState.cooldownUntil, now)}
              </span>
            </span>
            <span>·</span>
          </>
        )}
        {treeRefreshUiState.kind === "cooldown" && (
          <>
            <span
              className="inline-flex items-center gap-1 text-amber-700"
              title={treeRefreshFailureMessage ?? "Auto-refresh paused after a failed sync."}
            >
              <span>Paused</span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                {formatRelativeTimeUntil(treeRefreshUiState.cooldownUntil, now)}
              </span>
            </span>
            <span>·</span>
          </>
        )}
        {treeRefreshUiState.kind === "failed" && (
          <>
            <span
              className="text-amber-700"
              title={treeRefreshFailureMessage ?? "Last sync failed. Showing cached state."}
            >
              Last sync failed
            </span>
            <span>·</span>
          </>
        )}
        {checks && <RepositoryInventoryChecks summary={checks} />}
        {commitSha && commitUrl ? (
          <a
            className={`font-mono ${linkStyle}`}
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View commit on GitHub"
          >
            {commitSha.slice(0, 7)}
          </a>
        ) : (
          <span
            className="font-mono text-red-600"
            title="Missing commit SHA. Refresh repository tree to backfill."
          >
            missing commit SHA
          </span>
        )}
        {lastTreeRefreshAt && (
          <>
            <span>·</span>
            <span className="font-mono tabular-nums">
              {formatRelativeTimeAgoWithSeconds(lastTreeRefreshAt, now)}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

export function VaultSyncStatus({
  vaultId,
  stagedFiles,
  stagedFilesCount,
  disableStagedFilesQuery = false,
  ...props
}: VaultSyncStatusSharedProps & {
  vaultId: Id<"vaults">;
  stagedFiles?: VaultSyncStatusStagedFile[];
  stagedFilesCount?: number;
  disableStagedFilesQuery?: boolean;
}) {
  const shouldFetchStagedFiles =
    !disableStagedFilesQuery &&
    stagedFiles === undefined &&
    (stagedFilesCount === undefined || stagedFilesCount > 0);
  const stagedFilesFromQuery = useQuery(
    api.fileStaging.listStagedFiles,
    shouldFetchStagedFiles ? { vaultId, branch: props.branch } : "skip",
  );

  return (
    <VaultSyncStatusContent {...props} stagedFiles={stagedFiles ?? stagedFilesFromQuery ?? []} />
  );
}
