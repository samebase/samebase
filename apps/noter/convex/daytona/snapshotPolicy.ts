import { getDaytonaResourceScope } from "./env";
import { toSafeRepoName } from "../repoName";

export const DAYTONA_COMMIT_PINNED_BRANCH = "main";
export const DAYTONA_SNAPSHOT_RETENTION_COUNT = 3;
const DAYTONA_SNAPSHOT_RETRY_BASE_DELAY_MS = 60_000;
const DAYTONA_SNAPSHOT_RETRY_MAX_DELAY_MS = 15 * 60_000;

export function isCommitPinnedDaytonaBranch(branch: string): boolean {
  return branch.trim().toLowerCase() === DAYTONA_COMMIT_PINNED_BRANCH;
}

export function canonicalizeCommitPinnedDaytonaBranch(branch: string): string {
  const normalized = branch.trim();
  return isCommitPinnedDaytonaBranch(normalized)
    ? DAYTONA_COMMIT_PINNED_BRANCH
    : normalized;
}

export function shortenCommitSha(commitSha: string): string {
  const normalized = commitSha.trim().toLowerCase();
  return normalized.length <= 7 ? normalized : normalized.slice(0, 7);
}

function inferSnapshotRepoFallback(owner: string, repo: string): string {
  const safeFallback = toSafeRepoName(`${owner}-${repo}`);
  return safeFallback || "repo";
}

export function inferCommitPinnedSnapshotName(args: {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
}): string {
  const resourceScope = getDaytonaResourceScope();
  const normalizedCommitSha = args.commitSha.trim().toLowerCase();
  const base = toSafeRepoName(
    `noter-prebuild-${resourceScope}-${args.owner}-${args.repo}-${args.branch}-${normalizedCommitSha}`,
  );
  if (base) {
    return base;
  }
  return `noter-prebuild-${resourceScope}-${inferSnapshotRepoFallback(
    args.owner,
    args.repo,
  )}-${shortenCommitSha(normalizedCommitSha)}`;
}

export function inferCommitPinnedSnapshotPrefix(args: {
  owner: string;
  repo: string;
}): string {
  const resourceScope = getDaytonaResourceScope();
  const prefix = toSafeRepoName(
    `noter-prebuild-${resourceScope}-${args.owner}-${args.repo}-`,
  );
  return (
    prefix ||
    `noter-prebuild-${resourceScope}-${inferSnapshotRepoFallback(
      args.owner,
      args.repo,
    )}-`
  );
}

function inferLegacyDevCommitPinnedSnapshotPrefix(args: {
  owner: string;
  repo: string;
}): string {
  const prefix = toSafeRepoName(
    `noter-prebuild-dev-${args.owner}-${args.repo}-`,
  );
  return (
    prefix ||
    `noter-prebuild-dev-${inferSnapshotRepoFallback(args.owner, args.repo)}-`
  );
}

export function inferCommitPinnedSnapshotPrefixes(args: {
  owner: string;
  repo: string;
}): string[] {
  const currentPrefix = inferCommitPinnedSnapshotPrefix(args);
  if (getDaytonaResourceScope() === "prod") {
    return [currentPrefix];
  }

  const legacyDevPrefix = inferLegacyDevCommitPinnedSnapshotPrefix(args);
  return currentPrefix === legacyDevPrefix
    ? [currentPrefix]
    : [currentPrefix, legacyDevPrefix];
}

export function inferDaytonaWorkspaceSandboxName(args: {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  vaultId: string;
}): string {
  const resourceScope = getDaytonaResourceScope();
  const base = toSafeRepoName(
    `noter-${resourceScope}-${args.owner}-${args.repo}-${args.branch}-${shortenCommitSha(
      args.commitSha,
    )}`,
  );
  return base || `noter-${resourceScope}-${args.vaultId}`;
}

export function calculateSnapshotRetryDelayMs(attemptCount: number): number {
  const safeAttemptCount = Math.max(1, Math.trunc(attemptCount));
  const multiplier = 2 ** (safeAttemptCount - 1);
  return Math.min(
    DAYTONA_SNAPSHOT_RETRY_MAX_DELAY_MS,
    DAYTONA_SNAPSHOT_RETRY_BASE_DELAY_MS * multiplier,
  );
}
