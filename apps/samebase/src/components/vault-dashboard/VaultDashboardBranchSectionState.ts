import { api } from "../../../convex/_generated/api";

type RepositoryInventoryItem =
  (typeof api.repositoryInventory.listRepositoryInventoryPage)["_returnType"]["page"][number];

export interface VaultRemoteBranchListItem {
  rowKey: string;
  name: string;
  githubRepositoryFullName?: string;
  canOpenInSamebase: boolean;
  headCommitSha: string;
  isDefault: boolean;
  lastSyncedAt: number;
  commits: VaultBranchCommitListItem[];
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  pullRequestLabels?: Array<string | { name: string; color?: string }>;
  pullRequestTitle?: string;
  pullRequestIsDraft?: boolean;
  previewUrl?: string;
}

export interface VaultBranchCommitListItem {
  sha: string;
  title?: string;
  authoredAt?: number;
  checks?: VaultBranchCommitChecksSummary;
}

export interface VaultBranchCommitChecksSummary {
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
  primaryLogUrl?: string;
  syncedAt: number;
}

export function mapRepositoryInventoryItemToDashboardRow(
  item: RepositoryInventoryItem,
): VaultRemoteBranchListItem {
  const commit = {
    sha: item.headCommit.sha,
    title: item.headCommit.title,
    authoredAt: item.headCommit.authoredAt,
    checks: item.headCommit.checks,
  };

  if (item.kind === "branch") {
    return {
      rowKey: item.rowKey,
      name: item.name,
      githubRepositoryFullName: item.repositoryFullName,
      canOpenInSamebase: true,
      headCommitSha: item.headCommitSha,
      isDefault: item.isDefault,
      lastSyncedAt: item.lastSyncedAt,
      commits: [commit],
      previewUrl: item.previewUrl,
    };
  }

  return {
    rowKey: item.rowKey,
    name: item.headRefName,
    githubRepositoryFullName: item.headRepositoryFullName,
    canOpenInSamebase: item.canOpenInSamebase,
    headCommitSha: item.headCommitSha,
    isDefault: false,
    lastSyncedAt: item.lastSyncedAt,
    commits: [commit],
    pullRequestUrl: item.url,
    pullRequestNumber: item.number,
    pullRequestLabels: item.labels,
    pullRequestTitle: item.title,
    pullRequestIsDraft: item.isDraft,
    previewUrl: item.previewUrl,
  };
}
