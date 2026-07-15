import type { LoadedRepositoryInventoryItem } from "@/hooks/useRepositoryInventorySnapshot";

interface VaultRepositoryInventoryRowFields {
  rowKey: string;
  name: string;
  canOpenInSamebase: boolean;
  headCommit: VaultRepositoryInventoryHeadCommit;
  previewUrl?: string;
}

export type VaultRepositoryInventoryRow =
  | (VaultRepositoryInventoryRowFields & {
      kind: "branch";
      githubRepositoryFullName: string;
      isDefault: boolean;
    })
  | (VaultRepositoryInventoryRowFields & {
      kind: "pull_request";
      githubRepositoryFullName?: string;
      isDefault: false;
      pullRequestUrl: string;
      pullRequestNumber: number;
      pullRequestLabels: Array<string | { name: string; color?: string }>;
      pullRequestTitle: string;
      pullRequestIsDraft: boolean;
      pullRequestAdditions: number;
      pullRequestDeletions: number;
      pullRequestChangedFiles: number;
    });

export interface VaultRepositoryInventoryHeadCommit {
  sha: string;
  title?: string;
  authoredAt?: number;
  checks?: VaultRepositoryInventoryCommitChecksSummary;
}

export interface VaultRepositoryInventoryCommitChecksSummary {
  state: "success" | "failure" | "running" | "neutral" | "unknown";
  totalCount: number;
  checkRunCount: number;
  statusContextCount: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  neutralCount: number;
  unknownCount: number;
  primaryTargetUrl?: string;
}

export function mapRepositoryInventoryItemToDashboardRow(args: {
  item: LoadedRepositoryInventoryItem;
  repositoryFullName: string;
}): VaultRepositoryInventoryRow {
  const { item } = args;
  const commit = {
    sha: item.headCommit.sha,
    title: item.headCommit.title,
    authoredAt: item.headCommit.authoredAt,
    checks: item.headCommit.checks,
  };

  if (item.kind === "branch") {
    return {
      kind: "branch",
      rowKey: item.rowKey,
      name: item.name,
      githubRepositoryFullName: args.repositoryFullName,
      canOpenInSamebase: true,
      headCommit: commit,
      isDefault: item.isDefault,
      previewUrl: item.previewUrl,
    };
  }

  return {
    kind: "pull_request",
    rowKey: item.rowKey,
    name: item.headRefName,
    githubRepositoryFullName: item.headRepositoryFullName,
    canOpenInSamebase: item.canOpenInSamebase,
    headCommit: commit,
    isDefault: false,
    pullRequestUrl: item.url,
    pullRequestNumber: item.number,
    pullRequestLabels: item.labels,
    pullRequestTitle: item.title,
    pullRequestIsDraft: item.isDraft,
    pullRequestAdditions: item.additions,
    pullRequestDeletions: item.deletions,
    pullRequestChangedFiles: item.changedFiles,
    previewUrl: item.previewUrl,
  };
}
