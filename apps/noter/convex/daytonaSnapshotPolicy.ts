import { getDaytonaEnvLabel } from "./daytonaEnv";
import { toSafeRepoName } from "./repoName";

export const DAYTONA_COMMIT_PINNED_BRANCH = "main";
export const DAYTONA_SNAPSHOT_RETENTION_COUNT = 3;
const DAYTONA_SNAPSHOT_RETRY_BASE_DELAY_MS = 60_000;
const DAYTONA_SNAPSHOT_RETRY_MAX_DELAY_MS = 15 * 60_000;

export function isCommitPinnedDaytonaBranch(branch: string): boolean {
  return branch.trim().toLowerCase() === DAYTONA_COMMIT_PINNED_BRANCH;
}

export function shortenCommitSha(commitSha: string): string {
  const normalized = commitSha.trim();
  return normalized.length <= 7 ? normalized : normalized.slice(0, 7);
}

export function inferCommitPinnedSnapshotName(args: {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
}): string {
  const envLabel = getDaytonaEnvLabel();
  const base = toSafeRepoName(
    `noter-prebuild-${envLabel}-${args.owner}-${args.repo}-${args.branch}-${args.commitSha}`,
  );
  if (base) {
    return base;
  }
  return `noter-prebuild-${envLabel}-${shortenCommitSha(args.commitSha)}`;
}

export function inferCommitPinnedSnapshotPrefix(args: {
  owner: string;
  repo: string;
}): string {
  const envLabel = getDaytonaEnvLabel();
  const prefix = toSafeRepoName(
    `noter-prebuild-${envLabel}-${args.owner}-${args.repo}-`,
  );
  return prefix || `noter-prebuild-${envLabel}-`;
}

export function calculateSnapshotRetryDelayMs(attemptCount: number): number {
  const safeAttemptCount = Math.max(1, Math.trunc(attemptCount));
  const multiplier = 2 ** (safeAttemptCount - 1);
  return Math.min(
    DAYTONA_SNAPSHOT_RETRY_MAX_DELAY_MS,
    DAYTONA_SNAPSHOT_RETRY_BASE_DELAY_MS * multiplier,
  );
}
