import type {
  BranchHeadCommitChecksSummary,
  VaultBranchCommitChecksSummary,
  VaultBranchCommitSummary,
} from "../schema";

type BranchCommitSummarySource = {
  headCommitSha: string;
  lastCommitAt?: number;
  headCommitChecksSummary?: BranchHeadCommitChecksSummary;
};

function readBranchHeadCommitChecks(
  branch: BranchCommitSummarySource,
): VaultBranchCommitChecksSummary | undefined {
  const summary = branch.headCommitChecksSummary;
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
): VaultBranchCommitSummary[] {
  const commit: VaultBranchCommitSummary = {
    sha: branch.headCommitSha,
  };
  if (typeof branch.lastCommitAt === "number") {
    commit.authoredAt = branch.lastCommitAt;
  }
  const checks = readBranchHeadCommitChecks(branch);
  if (checks) {
    commit.checks = checks;
  }
  return [commit];
}
