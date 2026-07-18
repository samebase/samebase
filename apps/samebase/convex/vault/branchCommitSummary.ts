import type {
  GitHubCommitCheckSnapshot,
  VaultBranchCommitChecksSummary,
} from "../commitCheckModel";
import type { VaultBranchCommitSummary } from "./branchModel";

type BranchCommitSummarySource = {
  headCommitSha: string;
  lastCommitAt?: number;
};

function readBranchHeadCommitChecks(
  branch: BranchCommitSummarySource,
  snapshot: GitHubCommitCheckSnapshot | null | undefined,
): VaultBranchCommitChecksSummary | undefined {
  const summary = snapshot;
  if (!summary || summary.commitSha !== branch.headCommitSha) {
    return undefined;
  }

  return {
    state: summary.state,
    totalCount: summary.totalCount,
    checkRunCount: summary.checkRunCount,
    statusContextCount: summary.statusContextCount,
    successCount: summary.successCount,
    failureCount: summary.failureCount,
    runningCount: summary.runningCount,
    neutralCount: summary.neutralCount,
    unknownCount: summary.unknownCount,
    primaryTargetUrl: summary.primaryTargetUrl,
    primaryLogUrl: summary.primaryLogUrl,
    syncedAt: summary.syncedAt,
  };
}

export function buildVaultBranchCommitSummaries(
  branch: BranchCommitSummarySource,
  snapshot?: GitHubCommitCheckSnapshot | null,
): VaultBranchCommitSummary[] {
  const commit: VaultBranchCommitSummary = {
    sha: branch.headCommitSha,
  };
  if (typeof branch.lastCommitAt === "number") {
    commit.authoredAt = branch.lastCommitAt;
  }
  const checks = readBranchHeadCommitChecks(branch, snapshot);
  if (checks) {
    commit.checks = checks;
  }
  return [commit];
}
