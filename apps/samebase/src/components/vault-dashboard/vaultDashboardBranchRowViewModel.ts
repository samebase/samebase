import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { normalizePullRequestLabels, type PullRequestLabelDisplay } from "@/lib/pullRequestLabels";
import type {
  VaultRepositoryInventoryBranchComparison,
  VaultRepositoryInventoryCommitChecksSummary,
  VaultRepositoryInventoryPullRequestComparison,
  VaultRepositoryInventoryRow,
} from "@/components/vault-dashboard/VaultDashboardBranchSectionState";

export type VaultBranchPullRequestViewModel = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRefName: string;
  isCrossRepository: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: readonly PullRequestLabelDisplay[];
};

export type VaultBranchHeadCommitViewModel = {
  sha: string;
  shortSha: string;
  url?: string;
  title?: string;
  authoredAt?: number;
  checks?: VaultRepositoryInventoryCommitChecksSummary;
};

type VaultBranchRowViewModelFields = {
  name: string;
  githubUrl?: string;
  canOpenInSamebase: boolean;
  isDefault: boolean;
  previewUrl?: string;
  headCommit: VaultBranchHeadCommitViewModel;
};

export type VaultBranchRowViewModel =
  | (VaultBranchRowViewModelFields & {
      kind: "branch";
      comparison: VaultRepositoryInventoryBranchComparison;
      pullRequest?: never;
    })
  | (VaultBranchRowViewModelFields & {
      kind: "pull_request";
      comparison: VaultRepositoryInventoryPullRequestComparison;
      pullRequest: VaultBranchPullRequestViewModel;
    });

function buildCommitUrl(repositoryFullName: string, sha: string): string {
  return `https://github.com/${repositoryFullName}/commit/${sha}`;
}

export function buildVaultBranchRowViewModel({
  branch,
}: {
  branch: VaultRepositoryInventoryRow;
}): VaultBranchRowViewModel {
  const sourceRepositoryFullName = branch.githubRepositoryFullName;
  const row = {
    name: branch.name,
    githubUrl: sourceRepositoryFullName
      ? buildGitHubBranchTreeUrl({
          repositoryFullName: sourceRepositoryFullName,
          branchName: branch.name,
        })
      : undefined,
    canOpenInSamebase: branch.canOpenInSamebase,
    isDefault: branch.isDefault,
    previewUrl: branch.previewUrl,
    headCommit: {
      sha: branch.headCommit.sha,
      shortSha: branch.headCommit.sha.slice(0, 7),
      url: sourceRepositoryFullName
        ? buildCommitUrl(sourceRepositoryFullName, branch.headCommit.sha)
        : undefined,
      title: branch.headCommit.title,
      authoredAt: branch.headCommit.authoredAt,
      checks: branch.headCommit.checks,
    },
  };

  if (branch.kind === "branch") {
    return {
      ...row,
      kind: "branch",
      comparison: branch.comparison,
    };
  }

  return {
    ...row,
    kind: "pull_request",
    comparison: branch.comparison,
    pullRequest: {
      number: branch.pullRequestNumber,
      title: branch.pullRequestTitle,
      url: branch.pullRequestUrl,
      isDraft: branch.pullRequestIsDraft,
      baseRefName: branch.pullRequestBaseRefName,
      isCrossRepository: branch.pullRequestIsCrossRepository,
      additions: branch.pullRequestAdditions,
      deletions: branch.pullRequestDeletions,
      changedFiles: branch.pullRequestChangedFiles,
      labels: normalizePullRequestLabels(branch.pullRequestLabels),
    },
  };
}
