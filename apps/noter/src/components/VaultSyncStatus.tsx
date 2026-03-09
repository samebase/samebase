import { UpdateIcon } from "@radix-ui/react-icons";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TREE_REFRESH_STALE_LOCK_MS } from "../../shared/treeRefresh";
import { useNow } from "@/hooks/useNow";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { formatRelativeTimeAgoWithSeconds } from "@/lib/formatRelativeTime";
import { cn } from "@/lib/utils";
import { CommitStatus } from "./CommitStatus";
import { EditedFilesCategoriesPopover } from "./EditedFilesCategories";
import { linkStyle } from "./styles";

type StagedFile = NonNullable<
  (typeof api.fileStaging.listStagedFiles)["_returnType"]
>[number];

export function VaultSyncStatus({
  vaultId,
  repositoryFullName,
  branch,
  owner,
  repoName,
  commitSha,
  treeRefreshStartedAt,
  lastTreeRefreshAt,
  stagedFiles,
  stagedFilesCount,
  now: nowFromParent,
  disableStagedFilesQuery = false,
  showChecks = true,
  className,
}: {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  branch: string;
  owner: string;
  repoName: string;
  commitSha?: string;
  treeRefreshStartedAt?: number;
  lastTreeRefreshAt?: number;
  stagedFiles?: StagedFile[];
  stagedFilesCount?: number;
  now?: number;
  disableStagedFilesQuery?: boolean;
  showChecks?: boolean;
  className?: string;
}) {
  const fallbackNow = useNow({ enabled: nowFromParent === undefined });
  const now = nowFromParent ?? fallbackNow;
  const shouldFetchStagedFiles =
    !disableStagedFilesQuery &&
    stagedFiles === undefined &&
    (stagedFilesCount === undefined || stagedFilesCount > 0);
  const stagedFilesFromQuery = useQuery(
    api.fileStaging.listStagedFiles,
    shouldFetchStagedFiles ? { vaultId, branch } : "skip",
  );
  const resolvedStagedFiles = stagedFiles ?? stagedFilesFromQuery ?? [];

  const commitUrl = commitSha
    ? `https://github.com/${owner}/${repoName}/commit/${commitSha}`
    : null;

  const isSyncing =
    typeof treeRefreshStartedAt === "number" &&
    now - treeRefreshStartedAt < TREE_REFRESH_STALE_LOCK_MS;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
    >
      {resolvedStagedFiles.length > 0 && (
        <EditedFilesCategoriesPopover
          repositoryFullName={repositoryFullName}
          branch={branch}
          stagedFiles={resolvedStagedFiles}
        />
      )}

      {isSyncing ? (
        <span className="inline-flex items-center gap-1">
          <UpdateIcon className="animate-spin" />
          Syncing…
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          {showChecks && (
            <CommitStatus
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
