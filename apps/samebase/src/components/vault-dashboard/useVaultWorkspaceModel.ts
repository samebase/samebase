import { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { useVaultPullRequests } from "@/hooks/useVaultPullRequests";
import { useVaultSidebarSummaries } from "@/hooks/useVaultSidebarSummaries";
import { useCacheQuery } from "@/lib/convexQueryCache";
import { useQuery as useConvexQuery } from "convex/react";
import { useMemo } from "react";
import { buildProductionEnvironmentRoots } from "./vaultEnvironmentRoots";
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

export function useVaultWorkspaceModel(selectedRepositoryFullName: string | undefined): {
  model: VaultWorkspaceModel;
  commands: {
    invalidateProviderObservations: () => Promise<void>;
  };
} {
  const vaults = useCacheQuery(api.vault.dashboard.getUserVaults);
  const sidebarSummaries = useVaultSidebarSummaries();
  const selectedVault = useMemo(
    () => selectVault(vaults, selectedRepositoryFullName),
    [selectedRepositoryFullName, vaults],
  );
  const providerObservations = useVaultProviderObservations(selectedVault);
  const pullRequests = useVaultPullRequests({
    vault:
      selectedVault?.hasConnectedGitHubRepository && selectedVault.deletion.state === "not_deleting"
        ? selectedVault
        : null,
  });
  const viewerAccess = useConvexQuery(api.users.currentViewerAccess);
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus);

  const model = useMemo<VaultWorkspaceModel>(() => {
    if (!vaults) {
      return { state: "loading" };
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
                accessKeys: viewerAccess.accessKeys,
              }
            : { state: "loading" },
          cloudflareObservations: providerObservations.cloudflare,
          cloudflareConnection: cloudflareConnection
            ? { state: "ready", connection: cloudflareConnection }
            : { state: "loading" },
          convexObservations: providerObservations.convex,
          environmentRoots: selectedVault.defaultBranch
            ? buildProductionEnvironmentRoots({
                branch: selectedVault.defaultBranch,
                cloudflareObservations: providerObservations.cloudflare,
                convexObservations: providerObservations.convex,
                owner: selectedVault.ghRepoOwner,
                repoName: selectedVault.ghRepoName,
                schemaGraphEnabled:
                  viewerAccess?.accessKeys.includes("access_schema_graph") === true,
                vault: selectedVault,
              })
            : [],
          githubRepositoryUrl: `https://github.com/${selectedVault.ghRepoOwner}/${selectedVault.ghRepoName}`,
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
