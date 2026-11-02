import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { useRepositoryPullRequests } from "@/repository/dashboard/useRepositoryPullRequests";
import { useRepositorySidebarSummaries } from "@/repository/dashboard/useRepositorySidebarSummaries";
import { repositoryDashboardQueries } from "@/routes/repository-dashboard.queries";
import { rootQueries } from "@/routes/root.queries";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { buildAlchemyStackCards } from "./repositoryEnvironmentRoots";
import { isWaitingForFirstCommit } from "./repositorySourceSetup";
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
  const alchemyState = useRepositoryProviderObservations(accessibleSelectedRepository);
  const pullRequests = useRepositoryPullRequests({
    repository:
      accessibleSelectedRepository?.hasConnectedGitHubRepository &&
      accessibleSelectedRepository.deletion.state === "not_deleting" &&
      !isWaitingForFirstCommit(accessibleSelectedRepository)
        ? accessibleSelectedRepository
        : null,
    alchemyState,
  });
  const { data: viewerAccess } = useQuery(rootQueries.viewerAccess);

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
    const schemaGraphEnabled = viewerAccess?.accessKeys.includes("access_schema_graph") === true;
    const defaultBranch = accessibleSelectedRepository.defaultBranch;
    const productionCards =
      defaultBranch && alchemyState.state === "loaded" && alchemyState.observation.store === "found"
        ? buildAlchemyStackCards({
            stacks: alchemyState.observation,
            stage: {
              name: "prod",
              // The head commit that the default-branch block shows above the cards.
              headCommit:
                pullRequests.state === "current" || pullRequests.state === "stale"
                  ? (pullRequests.defaultBranch?.headCommitOid ?? null)
                  : null,
              branch: defaultBranch,
              owner: accessibleSelectedRepository.githubOwnerLogin,
              repoName: accessibleSelectedRepository.githubRepositoryName,
              schemaGraphEnabled,
              repository: accessibleSelectedRepository,
            },
          })
        : [];
    return {
      folderState,
      organizationTreeSettings,
      state: "ready",
      sidebarSummaries,
      organizations,
      selection: {
        state: "selected",
        workspace: {
          alchemyState,
          access: viewerAccess
            ? {
                state: "ready",
                accessKeys: viewerAccess.accessKeys,
              }
            : { state: "loading" },
          githubRepositoryUrl: `https://github.com/${accessibleSelectedRepository.githubOwnerLogin}/${accessibleSelectedRepository.githubRepositoryName}`,
          productionCards,
          pullRequests,
          repository: accessibleSelectedRepository,
        },
      },
      repositories: repositories.filter((repository) =>
        accessibleOrganizationIds.has(repository.organizationId),
      ),
    };
  }, [
    alchemyState,
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
