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

export function useVaultWorkspaceModel(
  selectedRepositoryFullName: string | undefined,
  organizationOwner?: string,
): VaultWorkspaceModel {
  const vaults = useCacheQuery(api.vault.dashboard.getUserVaults);
  const folderState = useCacheQuery(api.vault.folders.getVaultFolderState);
  const organizations = useConvexQuery(api.organizations.listForViewer);
  const organizationTreeSettings = useConvexQuery(
    api.vault.organizationTree.getVaultOrganizationTreeSettings,
  );
  const sidebarSummaries = useVaultSidebarSummaries();
  const selectedVault = useMemo(
    () => selectVault(vaults, selectedRepositoryFullName),
    [selectedRepositoryFullName, vaults],
  );
  const selectedOrganization = useMemo(
    () =>
      selectedVault && organizations
        ? (organizations.find(
            (organization) => organization.organizationId === selectedVault.organizationId,
          ) ?? null)
        : null,
    [organizations, selectedVault],
  );
  const accessibleSelectedVault = selectedOrganization ? selectedVault : null;
  const providerObservations = useVaultProviderObservations(accessibleSelectedVault);
  const pullRequests = useVaultPullRequests({
    vault:
      accessibleSelectedVault?.hasConnectedGitHubRepository &&
      accessibleSelectedVault.deletion.state === "not_deleting"
        ? accessibleSelectedVault
        : null,
  });
  const viewerAccess = useConvexQuery(api.users.currentViewerAccess);
  const cloudflareConnection = useConvexQuery(
    api.users.getCloudflareConnectionStatus,
    accessibleSelectedVault ? { organizationId: accessibleSelectedVault.organizationId } : "skip",
  );

  const model = useMemo<VaultWorkspaceModel>(() => {
    if (!vaults || !folderState || !organizations || !organizationTreeSettings) {
      return { state: "loading" };
    }
    const requestedOrganization = organizationOwner
      ? (organizations.find(
          (organization) =>
            organization.githubOwnerLogin.toLowerCase() === organizationOwner.toLowerCase(),
        ) ?? null)
      : null;
    const accessibleOrganizationIds = new Set(
      organizations.map((organization) => organization.organizationId),
    );
    if (!selectedRepositoryFullName) {
      const visibleOrganizations = organizationOwner
        ? requestedOrganization
          ? [requestedOrganization]
          : []
        : organizations;
      const visibleOrganizationIds = new Set(
        visibleOrganizations.map((organization) => organization.organizationId),
      );
      return {
        folderState,
        organizationTreeSettings,
        state: "ready",
        sidebarSummaries,
        organizations: visibleOrganizations,
        selection: { state: "root" },
        vaults: vaults.filter((vault) => visibleOrganizationIds.has(vault.organizationId)),
      };
    }
    if (!accessibleSelectedVault || !selectedOrganization) {
      return {
        folderState,
        organizationTreeSettings,
        state: "ready",
        sidebarSummaries,
        organizations: [],
        selection: {
          state: "missing",
          repositoryFullName: selectedRepositoryFullName,
        },
        vaults: [],
      };
    }
    return {
      folderState,
      organizationTreeSettings,
      state: "ready",
      sidebarSummaries,
      organizations,
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
          environmentRoots: accessibleSelectedVault.defaultBranch
            ? buildProductionEnvironmentRoots({
                branch: accessibleSelectedVault.defaultBranch,
                cloudflareObservations: providerObservations.cloudflare,
                convexObservations: providerObservations.convex,
                owner: accessibleSelectedVault.ghRepoOwner,
                repoName: accessibleSelectedVault.ghRepoName,
                schemaGraphEnabled:
                  viewerAccess?.accessKeys.includes("access_schema_graph") === true,
                vault: accessibleSelectedVault,
              })
            : [],
          githubRepositoryUrl: `https://github.com/${accessibleSelectedVault.ghRepoOwner}/${accessibleSelectedVault.ghRepoName}`,
          pullRequests,
          vault: accessibleSelectedVault,
        },
      },
      vaults: vaults.filter((vault) => accessibleOrganizationIds.has(vault.organizationId)),
    };
  }, [
    providerObservations.cloudflare,
    providerObservations.convex,
    cloudflareConnection,
    pullRequests,
    selectedRepositoryFullName,
    selectedOrganization,
    accessibleSelectedVault,
    folderState,
    organizationTreeSettings,
    sidebarSummaries,
    organizationOwner,
    organizations,
    vaults,
    viewerAccess,
  ]);

  return model;
}
