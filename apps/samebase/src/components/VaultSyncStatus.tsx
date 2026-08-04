import { UpdateIcon } from "@/lib/radixIcons";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNow } from "@/hooks/useNow";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  formatRelativeTimeAgoWithSeconds,
  formatRelativeTimeUntil,
} from "@/lib/formatRelativeTime";
import { getTreeRefreshUiState } from "@/lib/treeRefreshStatus";
import { cn } from "@/lib/utils";
import { CommitStatus } from "./CommitStatus";
import { EditedFilesCategoriesPopover } from "./EditedFilesCategories";
import { linkStyle } from "./styles";

export type VaultSyncStatusStagedFile = NonNullable<
  (typeof api.fileStaging.listStagedFiles)["_returnType"]
>[number];

type VaultSyncStatusSharedProps = {
  organizationId?: Id<"organizations">;
  repositoryFullName: string;
  branch: string;
  owner: string;
  repoName: string;
  commitSha?: string;
  treeRefreshStartedAt?: number;
  lastTreeRefreshAt?: number;
  lastTreeRefreshFailedAt?: number;
  treeRefreshFailureKind?: "failed" | "rate_limited";
  treeRefreshFailureMessage?: string;
  treeRefreshCooldownUntil?: number;
  stagedFiles?: VaultSyncStatusStagedFile[];
  now?: number;
  showChecks?: boolean;
  className?: string;
};

export function VaultSyncStatusContent({
  repositoryFullName,
  organizationId,
  branch,
  owner,
  repoName,
  commitSha,
  treeRefreshStartedAt,
  lastTreeRefreshAt,
  lastTreeRefreshFailedAt,
  treeRefreshFailureKind,
  treeRefreshFailureMessage,
  treeRefreshCooldownUntil,
  stagedFiles = [],
  now: nowFromParent,
  showChecks = true,
  className,
}: VaultSyncStatusSharedProps) {
  const fallbackNow = useNow({ enabled: nowFromParent === undefined });
  const now = nowFromParent ?? fallbackNow;
  const commitUrl = commitSha
    ? `https://github.com/${owner}/${repoName}/commit/${commitSha}`
    : null;
  const treeRefreshUiState = getTreeRefreshUiState({
    now,
    treeRefreshStartedAt,
    lastTreeRefreshAt,
    lastTreeRefreshFailedAt,
    treeRefreshFailureKind,
    treeRefreshCooldownUntil,
  });
  const isSyncing = treeRefreshUiState.kind === "syncing";
  const suppressChecks =
    treeRefreshUiState.kind === "rate_limited" || treeRefreshUiState.kind === "cooldown";

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {stagedFiles.length > 0 && (
        <EditedFilesCategoriesPopover
          repositoryFullName={repositoryFullName}
          branch={branch}
          stagedFiles={stagedFiles}
        />
      )}

      {isSyncing ? (
        <span className="inline-flex items-center gap-1">
          <UpdateIcon className="animate-spin" />
          Syncing…
        </span>
      ) : treeRefreshUiState.kind === "rate_limited" ? (
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
      ) : treeRefreshUiState.kind === "cooldown" ? (
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
      ) : (
        <span className="inline-flex items-center gap-1">
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
          {showChecks && !suppressChecks && organizationId && (
            <CommitStatus
              organizationId={organizationId}
              owner={owner}
              repo={repoName}
              commitSha={commitSha}
              className="mr-1"
            />
          )}
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
      )}
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
  organizationId: Id<"organizations">;
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
