import { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { useVaultPullRequests } from "@/hooks/useVaultPullRequests";
import { useVaultSidebarSummaries } from "@/hooks/useVaultSidebarSummaries";
import { useCacheQuery } from "@/lib/convexQueryCache";
import { useQuery as useConvexQuery } from "convex/react";
import { useMemo } from "react";
import {
  getDefaultVaultPullRequestFilters,
  normalizeVaultPullRequestFilters,
} from "./vaultDashboardPullRequestFilters";
import { buildVaultProductionRoots } from "./vaultProductionRoots";
import type { VaultWorkspaceModel } from "./vaultWorkspaceModel";
import { useVaultProviderObservations } from "./useVaultProviderObservations";

function selectVault(
  vaults: readonly UserVaultResult[] | undefined,
  repositoryFullName: string | undefined,
): UserVaultResult | null {
  if (!vaults || !repositoryFullName) {
    return null;
  }

  return vaults.find((vault) => vault.repositoryFullName === repositoryFullName) ?? null;
}

export function useVaultWorkspaceModel(
  selectedRepositoryFullName: string | undefined,
  loadSidebarSummaries: boolean,
): {
  model: VaultWorkspaceModel;
  commands: {
    invalidateProviderObservations: () => Promise<void>;
  };
} {
  const vaults = useCacheQuery(api.vault.dashboard.getUserVaults);
  const sidebarSummaries = useVaultSidebarSummaries(loadSidebarSummaries);
  const selectedVault = useMemo(
    () => selectVault(vaults, selectedRepositoryFullName),
    [selectedRepositoryFullName, vaults],
  );
  const providerObservations = useVaultProviderObservations(selectedVault);
  const savedPullRequestFilters = useConvexQuery(
    api.vault.dashboard.getUserVaultPullRequestFilters,
  );
  const selectedPullRequestFilters = useMemo(() => {
    const savedFilters = savedPullRequestFilters?.find(
      (filters) => filters.vaultId === selectedVault?._id,
    );

    return savedFilters
      ? normalizeVaultPullRequestFilters(savedFilters)
      : getDefaultVaultPullRequestFilters();
  }, [savedPullRequestFilters, selectedVault?._id]);
  const pullRequests = useVaultPullRequests({
    vault:
      selectedVault?.hasConnectedGitHubRepository && selectedVault.deletion.state === "not_deleting"
        ? selectedVault
        : null,
    filters: selectedPullRequestFilters,
  });
  const viewerAccess = useConvexQuery(api.users.currentViewerAccess);
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus);

  const model = useMemo<VaultWorkspaceModel>(() => {
    if (!vaults) {
      return {
        state: "loading",
        selectedRepositoryFullName,
      };
    }
    if (!selectedRepositoryFullName) {
      return {
        state: "ready",
        sidebarSummaries,
        selection: { state: "root" },
        vaults,
      };
    }
    if (!selectedVault) {
      return {
        state: "ready",
        sidebarSummaries,
        selection: {
          state: "missing",
          repositoryFullName: selectedRepositoryFullName,
        },
        vaults,
      };
    }

    return {
      state: "ready",
      sidebarSummaries,
      selection: {
        state: "selected",
        workspace: {
          access: viewerAccess
            ? {
                state: "ready",
                schemaGraphEnabled: viewerAccess.accessKeys.includes("access_schema_graph"),
              }
            : { state: "loading" },
          cloudflareObservations: providerObservations.cloudflare,
          cloudflareConnection: cloudflareConnection
            ? { state: "ready", connection: cloudflareConnection }
            : { state: "loading" },
          convexObservations: providerObservations.convex,
          githubRepositoryUrl: `https://github.com/${selectedVault.ghRepoOwner}/${selectedVault.ghRepoName}`,
          productionRoots: buildVaultProductionRoots({
            cloudflareObservations: providerObservations.cloudflare,
            convexObservations: providerObservations.convex,
            vault: selectedVault,
          }),
          pullRequestFilters: selectedPullRequestFilters,
          pullRequests,
          vault: selectedVault,
        },
      },
      vaults,
    };
  }, [
    providerObservations.cloudflare,
    providerObservations.convex,
    cloudflareConnection,
    pullRequests,
    selectedPullRequestFilters,
    selectedRepositoryFullName,
    selectedVault,
    sidebarSummaries,
    vaults,
    viewerAccess,
  ]);

  return {
    model,
    commands: {
      invalidateProviderObservations: providerObservations.invalidate,
    },
  };
}
