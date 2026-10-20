import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { useRepositoryPullRequests } from "@/repository/dashboard/useRepositoryPullRequests";
import { useRepositorySidebarSummaries } from "@/repository/dashboard/useRepositorySidebarSummaries";
import { repositoryDashboardQueries } from "@/routes/repository-dashboard.queries";
import { rootQueries } from "@/routes/root.queries";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useQuery as useConvexQuery } from "convex/react";
import { useMemo } from "react";
import { buildProductionEnvironmentRoots } from "./repositoryEnvironmentRoots";
import type { RepositoryWorkspaceModel } from "./repositoryWorkspaceModel";
import { useRepositoryProviderObservations } from "./useRepositoryProviderObservations";

function selectRepository(
  repositories: readonly UserRepositoryResult[] | undefined,
  githubRepositoryFullName: string | undefined,
): UserRepositoryResult | null {
  if (!repositories || !githubRepositoryFullName) {
    return null;
  }

  return (
    repositories.find(
      (repository) => repository.githubRepositoryFullName === githubRepositoryFullName,
    ) ?? null
  );
}

export function useRepositoryWorkspaceModel(
  selectedRepositoryFullName: string | undefined,
  organizationOwner?: string,
): RepositoryWorkspaceModel {
  // The loaders of the routes that render this model fetch these before the page renders, on the
  // server and on a navigation in the browser.
  const { data: repositories } = useSuspenseQuery(repositoryDashboardQueries.repositories);
  const { data: folderState } = useSuspenseQuery(repositoryDashboardQueries.folderState);
  const { data: organizations } = useSuspenseQuery(repositoryDashboardQueries.organizations);
  const { data: organizationTreeSettings } = useSuspenseQuery(
    repositoryDashboardQueries.organizationTreeSettings,
  );
  const sidebarSummaries = useRepositorySidebarSummaries();
  const selectedRepository = useMemo(
    () => selectRepository(repositories, selectedRepositoryFullName),
    [selectedRepositoryFullName, repositories],
  );
  const selectedOrganization = useMemo(
    () =>
      selectedRepository
        ? (organizations.find(
            (organization) => organization.organizationId === selectedRepository.organizationId,
          ) ?? null)
        : null,
    [organizations, selectedRepository],
  );
  const accessibleSelectedRepository = selectedOrganization ? selectedRepository : null;
  const providerObservations = useRepositoryProviderObservations(accessibleSelectedRepository);
  const pullRequests = useRepositoryPullRequests({
    repository:
      accessibleSelectedRepository?.hasConnectedGitHubRepository &&
      accessibleSelectedRepository.deletion.state === "not_deleting"
        ? accessibleSelectedRepository
        : null,
  });
  const { data: viewerAccess } = useQuery(rootQueries.viewerAccess);
  const cloudflareConnection = useConvexQuery(
    api.users.getCloudflareConnectionStatus,
    accessibleSelectedRepository
      ? { organizationId: accessibleSelectedRepository.organizationId }
      : "skip",
  );

  const model = useMemo<RepositoryWorkspaceModel>(() => {
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
        repositories: repositories.filter((repository) =>
          visibleOrganizationIds.has(repository.organizationId),
        ),
      };
    }
    if (!accessibleSelectedRepository || !selectedOrganization) {
      return {
        folderState,
        organizationTreeSettings,
        state: "ready",
        sidebarSummaries,
        organizations: [],
        selection: {
          state: "missing",
          githubRepositoryFullName: selectedRepositoryFullName,
        },
        repositories: [],
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
          environmentRoots: accessibleSelectedRepository.defaultBranch
            ? buildProductionEnvironmentRoots({
                branch: accessibleSelectedRepository.defaultBranch,
                cloudflareObservations: providerObservations.cloudflare,
                convexObservations: providerObservations.convex,
                owner: accessibleSelectedRepository.githubOwnerLogin,
                repoName: accessibleSelectedRepository.githubRepositoryName,
                schemaGraphEnabled:
                  viewerAccess?.accessKeys.includes("access_schema_graph") === true,
                repository: accessibleSelectedRepository,
              })
            : [],
          githubRepositoryUrl: `https://github.com/${accessibleSelectedRepository.githubOwnerLogin}/${accessibleSelectedRepository.githubRepositoryName}`,
          pullRequests,
          repository: accessibleSelectedRepository,
        },
      },
      repositories: repositories.filter((repository) =>
        accessibleOrganizationIds.has(repository.organizationId),
      ),
    };
  }, [
    providerObservations.cloudflare,
    providerObservations.convex,
    cloudflareConnection,
    pullRequests,
    selectedRepositoryFullName,
    selectedOrganization,
    accessibleSelectedRepository,
    folderState,
    organizationTreeSettings,
    sidebarSummaries,
    organizationOwner,
    organizations,
    repositories,
    viewerAccess,
  ]);

  return model;
}
