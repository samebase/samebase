import {
  buildVaultBranchFilterOptions,
  filterVaultRemoteBranches,
  type VaultBranchFilters as VaultBranchFiltersState,
} from "@/components/vault-dashboard/vaultDashboardBranchFilters";

export interface VaultRemoteBranchListItem {
  name: string;
  headCommitSha: string;
  isDefault: boolean;
  isProtected: boolean;
  remoteState: "active" | "deleted_upstream";
  lastSyncedAt: number;
  commits: VaultBranchCommitListItem[];
  aheadBy?: number;
  behindBy?: number;
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

export function buildVaultBranchSectionState({
  filters,
  remoteBranches,
}: {
  filters: VaultBranchFiltersState;
  remoteBranches: readonly VaultRemoteBranchListItem[];
}) {
  const filteredRemoteBranches = filterVaultRemoteBranches(remoteBranches, filters);
  const hiddenBranchCount = remoteBranches.length - filteredRemoteBranches.length;
  const filterOptions = buildVaultBranchFilterOptions({
    branches: remoteBranches,
    hiddenLabels: filters.hiddenLabels,
    includeNoLabel: filters.includeNoLabel,
  });

  return {
    filteredRemoteBranches,
    filterOptions,
    hiddenBranchCount,
  };
}
