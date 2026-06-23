import {
  buildVaultBranchFilterOptions,
  filterVaultRemoteBranches,
  type VaultBranchFilters as VaultBranchFiltersState,
} from "@/components/vault-dashboard/vaultDashboardBranchFilters";

const COLLAPSED_BRANCH_LIMIT = 5;

export interface VaultRemoteBranchListItem {
  name: string;
  headCommitSha: string;
  isDefault: boolean;
  isProtected: boolean;
  remoteState: "active" | "deleted_upstream";
  lastSyncedAt: number;
  aheadBy?: number;
  behindBy?: number;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  pullRequestLabels?: Array<string | { name: string; color?: string }>;
  pullRequestTitle?: string;
  pullRequestIsDraft?: boolean;
  pullRequestStatusSummary?: {
    pullRequestNumber: number;
    headCommitSha: string;
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
  };
}

export function buildVaultBranchSectionState({
  filters,
  remoteBranches,
}: {
  filters: VaultBranchFiltersState;
  remoteBranches: VaultRemoteBranchListItem[];
}) {
  const filteredRemoteBranches = filterVaultRemoteBranches(remoteBranches, filters);
  const hasBranchListOverflow = filteredRemoteBranches.length > COLLAPSED_BRANCH_LIMIT;
  const branchesExpanded = filters.branchesExpanded;
  const visibleRemoteBranches =
    hasBranchListOverflow && !branchesExpanded
      ? filteredRemoteBranches.slice(0, COLLAPSED_BRANCH_LIMIT)
      : filteredRemoteBranches;
  const collapsedBranchCount = Math.max(filteredRemoteBranches.length - COLLAPSED_BRANCH_LIMIT, 0);
  const hiddenBranchCount = remoteBranches.length - filteredRemoteBranches.length;
  const filterOptions = buildVaultBranchFilterOptions({
    branches: remoteBranches,
    hiddenLabels: filters.hiddenLabels,
    includeNoLabel: filters.includeNoLabel,
  });

  return {
    collapsedBranchCount,
    filteredRemoteBranches,
    filterOptions,
    hasBranchListOverflow,
    hiddenBranchCount,
    visibleRemoteBranches,
  };
}
