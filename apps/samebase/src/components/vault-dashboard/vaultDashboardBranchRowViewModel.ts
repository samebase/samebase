import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { normalizePullRequestLabels, type PullRequestLabelDisplay } from "@/lib/pullRequestLabels";
import type {
  VaultRepositoryInventoryCommitChecksSummary,
  VaultRepositoryInventoryRow,
} from "@/components/vault-dashboard/VaultDashboardBranchSectionState";

export type VaultBranchPullRequestViewModel = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
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

export type VaultBranchRowViewModel = {
  name: string;
  githubUrl?: string;
  canOpenInSamebase: boolean;
  isDefault: boolean;
  previewUrl?: string;
  pullRequest?: VaultBranchPullRequestViewModel;
  headCommit: VaultBranchHeadCommitViewModel;
};

function buildCommitUrl(repositoryFullName: string, sha: string): string {
  return `https://github.com/${repositoryFullName}/commit/${sha}`;
}

export function buildVaultBranchRowViewModel({
  branch,
}: {
  branch: VaultRepositoryInventoryRow;
}): VaultBranchRowViewModel {
  const sourceRepositoryFullName = branch.githubRepositoryFullName;

  return {
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
    pullRequest:
      branch.kind === "branch"
        ? undefined
        : {
            number: branch.pullRequestNumber,
            title: branch.pullRequestTitle,
            url: branch.pullRequestUrl,
            isDraft: branch.pullRequestIsDraft,
            additions: branch.pullRequestAdditions,
            deletions: branch.pullRequestDeletions,
            changedFiles: branch.pullRequestChangedFiles,
            labels: normalizePullRequestLabels(branch.pullRequestLabels),
          },
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
}
