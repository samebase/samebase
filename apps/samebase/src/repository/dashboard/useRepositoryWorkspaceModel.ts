import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { useRepositoryPullRequests } from "@/repository/dashboard/useRepositoryPullRequests";
import { useRepositorySidebarSummaries } from "@/repository/dashboard/useRepositorySidebarSummaries";
import { repositoryDashboardQueries } from "@/routes/repository-dashboard.queries";
import { rootQueries } from "@/routes/root.queries";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useQuery as useConvexQuery } from "convex/react";
import { useMemo } from "react";
import {
  buildAlchemyStackCards,
  buildProductionEnvironmentRoots,
} from "./repositoryEnvironmentRoots";
import type {
  RepositoryWorkspaceModel,
  RepositoryWorkspaceProduction,
} from "./repositoryWorkspaceModel";
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

/**
`source: "attachments"` is `?attachments` on the repository overview: the default-branch block and
the pull request rows come from the attachment rows and their live reads, and no read consults the
Alchemy state store of the team.
*/
export function useRepositoryWorkspaceModel(
  selectedRepositoryFullName: string | undefined,
  organizationOwner?: string,
  source?: "attachments",
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
  const providerObservations = useRepositoryProviderObservations(
    accessibleSelectedRepository,
    source,
  );
  const pullRequests = useRepositoryPullRequests({
    repository:
      accessibleSelectedRepository?.hasConnectedGitHubRepository &&
      accessibleSelectedRepository.deletion.state === "not_deleting"
        ? accessibleSelectedRepository
        : null,
    source,
    alchemyState: providerObservations.alchemyState,
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
    const alchemyObservations = providerObservations.alchemy;
    const alchemyStacks =
      alchemyObservations.state === "loaded" ? alchemyObservations.observations.at(0) : undefined;
    const schemaGraphEnabled = viewerAccess?.accessKeys.includes("access_schema_graph") === true;
    const defaultBranch = accessibleSelectedRepository.defaultBranch;
    // By presence: the stacks in the team store build the default-branch block, and the attachment
    // rows with their live reads build it otherwise. Neither builds it while the store read runs.
    const production: RepositoryWorkspaceProduction =
      defaultBranch && alchemyStacks
        ? {
            source: "stacks",
            cards: buildAlchemyStackCards({
              branch: defaultBranch,
              owner: accessibleSelectedRepository.githubOwnerLogin,
              repoName: accessibleSelectedRepository.githubRepositoryName,
              schemaGraphEnabled,
              repository: accessibleSelectedRepository,
              stacks: alchemyStacks,
            }),
          }
        : {
            source: "attachments",
            roots:
              !defaultBranch || alchemyObservations.state === "loading"
                ? []
                : buildProductionEnvironmentRoots({
                    branch: defaultBranch,
                    cloudflareObservations: providerObservations.cloudflare,
                    convexObservations: providerObservations.convex,
                    owner: accessibleSelectedRepository.githubOwnerLogin,
                    repoName: accessibleSelectedRepository.githubRepositoryName,
                    schemaGraphEnabled,
                    repository: accessibleSelectedRepository,
                  }),
          };
    return {
      folderState,
      organizationTreeSettings,
      state: "ready",
      sidebarSummaries,
      organizations,
      selection: {
        state: "selected",
        workspace: {
          alchemyObservations,
          alchemyState: providerObservations.alchemyState,
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
          githubRepositoryUrl: `https://github.com/${accessibleSelectedRepository.githubOwnerLogin}/${accessibleSelectedRepository.githubRepositoryName}`,
          production,
          pullRequests,
          repository: accessibleSelectedRepository,
        },
      },
      repositories: repositories.filter((repository) =>
        accessibleOrganizationIds.has(repository.organizationId),
      ),
    };
  }, [
    providerObservations.alchemy,
    providerObservations.alchemyState,
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
