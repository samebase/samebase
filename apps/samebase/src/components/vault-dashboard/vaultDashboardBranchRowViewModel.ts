import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { normalizePullRequestLabels, type PullRequestLabelDisplay } from "@/lib/pullRequestLabels";
import type {
  VaultBranchCommitChecksSummary,
  VaultRemoteBranchListItem,
} from "@/components/vault-dashboard/VaultDashboardBranchSectionState";

export type VaultBranchPullRequestViewModel = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  labels: readonly PullRequestLabelDisplay[];
};

export type VaultBranchCommitViewModel = {
  sha: string;
  shortSha: string;
  url: string;
  title?: string;
  authoredAt?: number;
  checks?: VaultBranchCommitChecksSummary;
  isHead: boolean;
};

export type VaultBranchRowViewModel = {
  name: string;
  githubUrl: string;
  isDefault: boolean;
  isProtected: boolean;
  remoteState: VaultRemoteBranchListItem["remoteState"];
  aheadBy?: number;
  behindBy?: number;
  pullRequest?: VaultBranchPullRequestViewModel;
  commits: readonly VaultBranchCommitViewModel[];
};

function buildCommitUrl(repositoryFullName: string, sha: string): string {
  return `https://github.com/${repositoryFullName}/commit/${sha}`;
}

function buildVaultBranchPullRequestViewModel(
  branch: VaultRemoteBranchListItem,
): VaultBranchPullRequestViewModel | undefined {
  if (
    typeof branch.pullRequestNumber !== "number" ||
    typeof branch.pullRequestTitle !== "string" ||
    branch.pullRequestTitle.length === 0 ||
    typeof branch.pullRequestUrl !== "string" ||
    branch.pullRequestUrl.length === 0
  ) {
    return undefined;
  }

  return {
    number: branch.pullRequestNumber,
    title: branch.pullRequestTitle,
    url: branch.pullRequestUrl,
    isDraft: branch.pullRequestIsDraft === true,
    labels: normalizePullRequestLabels(branch.pullRequestLabels),
  };
}

export function buildVaultBranchRowViewModel({
  branch,
  repositoryFullName,
}: {
  branch: VaultRemoteBranchListItem;
  repositoryFullName: string;
}): VaultBranchRowViewModel {
  return {
    name: branch.name,
    githubUrl: buildGitHubBranchTreeUrl({
      repositoryFullName,
      branchName: branch.name,
    }),
    isDefault: branch.isDefault,
    isProtected: branch.isProtected,
    remoteState: branch.remoteState,
    aheadBy: branch.aheadBy,
    behindBy: branch.behindBy,
    pullRequest: buildVaultBranchPullRequestViewModel(branch),
    commits: branch.commits.map((commit, index) => ({
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      url: buildCommitUrl(repositoryFullName, commit.sha),
      title: commit.title,
      authoredAt: commit.authoredAt,
      checks: commit.checks,
      isHead: commit.sha === branch.headCommitSha || index === 0,
    })),
  };
}
