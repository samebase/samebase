import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { isRepositoryBeingCreated } from "@/repository/dashboard/repositoryAlchemyStore";
import { repositoryExternalDataQueryKey } from "@/repository/dashboard/repositoryExternalDataQueryKey";
import type { AlchemyStateObservation } from "../../../shared/alchemyStateModel";
import {
  useRepositoryAlchemyState,
  type RepositoryAlchemyState,
} from "./useRepositoryAlchemyState";

export type RepositoryCloudflareWorkerObservation =
  (typeof api.repository.providerObservations.observeCloudflareWorkers)["_returnType"][number];
export type RepositoryCloudflareWorkerBuildsObservation =
  (typeof api.repository.providerObservations.observeCloudflareWorkerBuilds)["_returnType"][number];
export type RepositoryCloudflareWorkerConvexBuildAccessObservation =
  (typeof api.repository.providerObservations.observeCloudflareWorkerConvexBuildAccess)["_returnType"][number];
export type RepositoryConvexProjectObservation =
  (typeof api.repository.providerObservations.observeConvexProjects)["_returnType"][number];
/** The stacks of the repository in the Alchemy state store of its Convex team. */
export type RepositoryAlchemyStacks = Extract<AlchemyStateObservation, { store: "found" }>;

export type RepositoryProviderObservationState<TObservation> =
  | { state: "loading" }
  | { state: "checking" }
  | {
      state: "loaded";
      observations: readonly TObservation[];
      refreshFailed: boolean;
      reload: () => void;
    }
  | { state: "failed"; reload: () => void };

export type RepositoryCloudflareProviderObservationState = {
  workers: RepositoryProviderObservationState<RepositoryCloudflareWorkerObservation>;
  builds: RepositoryProviderObservationState<RepositoryCloudflareWorkerBuildsObservation>;
  convexBuildAccess: RepositoryProviderObservationState<RepositoryCloudflareWorkerConvexBuildAccessObservation>;
};

type RepositoryProviderObservationTarget = Pick<
  UserRepositoryResult,
  "repositoryId" | "providerWrite" | "convexTeamId" | "hasConnectedGitHubRepository"
> & {
  sourceSetup: Pick<UserRepositoryResult["sourceSetup"], "status">;
  cloudflareWorkers: readonly Pick<UserRepositoryResult["cloudflareWorkers"][number], "workerId">[];
  convexProjects: readonly Pick<
    UserRepositoryResult["convexProjects"][number],
    "codeLocation" | "convexProjectId" | "projectId" | "teamId"
  >[];
};

const PROVIDER_OBSERVATION_STALE_TIME_MS = 60 * 1000;
const PROVIDER_OBSERVATION_GC_TIME_MS = 5 * 60 * 1000;

function providerObservationState<TObservation>({
  data,
  isError,
  isRefetchError,
  lastWriteAt,
  reload,
  requested,
}: {
  data: readonly TObservation[] | undefined;
  isError: boolean;
  isRefetchError: boolean;
  lastWriteAt: number | undefined;
  reload: () => void;
  requested: boolean;
}): RepositoryProviderObservationState<TObservation> {
  if (!requested) {
    return { state: "loaded", observations: [], refreshFailed: false, reload };
  }
  if (data) {
    return { state: "loaded", observations: data, refreshFailed: isRefetchError, reload };
  }
  if (!isError && lastWriteAt !== undefined) {
    return { state: "checking" };
  }
  return isError ? { state: "failed", reload } : { state: "loading" };
}

export function useRepositoryProviderObservations(
  repository: RepositoryProviderObservationTarget | null,
  /** `attachments` reads no team store: `alchemy` holds no stack. */
  source?: "attachments",
): {
  cloudflare: RepositoryCloudflareProviderObservationState;
  convex: RepositoryProviderObservationState<RepositoryConvexProjectObservation>;
  /** One observation when the team store holds a stack with stages of the repository, else none. */
  alchemy: RepositoryProviderObservationState<RepositoryAlchemyStacks>;
  alchemyState: RepositoryAlchemyState;
} {
  const observeCloudflareWorkers = useAction(
    api.repository.providerObservations.observeCloudflareWorkers,
  );
  const observeCloudflareWorkerBuilds = useAction(
    api.repository.providerObservations.observeCloudflareWorkerBuilds,
  );
  const observeCloudflareWorkerConvexBuildAccess = useAction(
    api.repository.providerObservations.observeCloudflareWorkerConvexBuildAccess,
  );
  const observeConvexProjects = useAction(
    api.repository.providerObservations.observeConvexProjects,
  );
  const repositoryId = repository?.repositoryId;
  const convexTeamId = repository?.convexTeamId;
  const cloudflareLastWriteAt = repository?.providerWrite.lastWriteAt.cloudflare;
  const convexLastWriteAt = repository?.providerWrite.lastWriteAt.convex;
  const cloudflareWorkerIds = [...(repository?.cloudflareWorkers ?? [])]
    .map((worker) => worker.workerId)
    .sort((left, right) => left.localeCompare(right));
  const convexProjectTargets = [...(repository?.convexProjects ?? [])]
    .map((project) => ({
      codeLocation: project.codeLocation,
      convexProjectId: project.convexProjectId,
      projectId: project.projectId,
      teamId: project.teamId,
    }))
    .sort((left, right) => left.convexProjectId.localeCompare(right.convexProjectId));

  const cloudflareWorkersQuery = useQuery({
    queryKey: [
      ...repositoryExternalDataQueryKey(repositoryId),
      "cloudflare-workers",
      cloudflareWorkerIds,
      cloudflareLastWriteAt,
    ],
    queryFn: async () => {
      if (!repositoryId) {
        throw new Error("Repository is required to observe Cloudflare Workers.");
      }
      return await observeCloudflareWorkers({ repositoryId });
    },
    enabled: Boolean(repositoryId && cloudflareWorkerIds.length > 0),
    retry: false,
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });
  const cloudflareBuildsQuery = useQuery({
    queryKey: [
      ...repositoryExternalDataQueryKey(repositoryId),
      "cloudflare-worker-builds",
      cloudflareWorkerIds,
      cloudflareLastWriteAt,
    ],
    queryFn: async () => {
      if (!repositoryId) {
        throw new Error("Repository is required to observe Cloudflare Workers Builds.");
      }
      return await observeCloudflareWorkerBuilds({ repositoryId });
    },
    enabled: Boolean(repositoryId && cloudflareWorkerIds.length > 0),
    retry: false,
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
    refetchInterval: PROVIDER_OBSERVATION_STALE_TIME_MS,
    refetchIntervalInBackground: false,
  });
  const cloudflareBuildAccessTargets = (cloudflareBuildsQuery.data ?? [])
    .flatMap((observation) =>
      observation.state === "available" && observation.builds.state === "connected"
        ? [
            {
              workerId: observation.workerId,
            },
          ]
        : [],
    )
    .sort((left, right) => left.workerId.localeCompare(right.workerId));
  const cloudflareConvexBuildAccessQuery = useQuery({
    queryKey: [
      ...repositoryExternalDataQueryKey(repositoryId),
      "cloudflare-worker-convex-build-access",
      cloudflareBuildAccessTargets,
      convexProjectTargets,
      cloudflareLastWriteAt,
    ],
    queryFn: async () => {
      if (!repositoryId) {
        throw new Error("Repository is required to observe Convex build access.");
      }
      if (cloudflareBuildAccessTargets.length === 0) {
        return [];
      }
      return await observeCloudflareWorkerConvexBuildAccess({
        repositoryId,
        targets: cloudflareBuildAccessTargets,
      });
    },
    enabled: Boolean(repositoryId && cloudflareBuildAccessTargets.length > 0),
    retry: false,
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });
  const convexQuery = useQuery({
    queryKey: [
      ...repositoryExternalDataQueryKey(repositoryId),
      "convex",
      convexProjectTargets,
      convexLastWriteAt,
    ],
    queryFn: async () => {
      if (!repositoryId) {
        throw new Error("Repository is required to observe Convex projects.");
      }
      return await observeConvexProjects({ repositoryId });
    },
    enabled: Boolean(repositoryId && convexProjectTargets.length > 0),
    retry: false,
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });

  // The store lives in the Convex team of the repository, so a repository without one has no stack.
  const alchemyRequested = Boolean(convexTeamId) && source !== "attachments";
  const alchemyWaiting =
    alchemyRequested && repository !== null && isRepositoryBeingCreated(repository);
  const alchemyRead = useRepositoryAlchemyState(
    alchemyRequested && !alchemyWaiting ? (repositoryId ?? null) : null,
    convexTeamId,
  );
  const alchemyState: RepositoryAlchemyState = alchemyWaiting ? { state: "loading" } : alchemyRead;

  const reloadCloudflareWorkers = () => {
    void cloudflareWorkersQuery.refetch();
  };
  const reloadCloudflareBuilds = () => {
    void cloudflareBuildsQuery.refetch();
  };
  const reloadCloudflareConvexBuildAccess = () => {
    void cloudflareConvexBuildAccessQuery.refetch();
  };
  const reloadConvex = () => {
    void convexQuery.refetch();
  };
  const workers = providerObservationState({
    data: cloudflareWorkersQuery.data,
    isError: cloudflareWorkersQuery.isError,
    isRefetchError: cloudflareWorkersQuery.isRefetchError,
    lastWriteAt: cloudflareLastWriteAt,
    reload: reloadCloudflareWorkers,
    requested: cloudflareWorkerIds.length > 0,
  });
  const builds = providerObservationState({
    data: cloudflareBuildsQuery.data,
    isError: cloudflareBuildsQuery.isError,
    isRefetchError: cloudflareBuildsQuery.isRefetchError,
    lastWriteAt: cloudflareLastWriteAt,
    reload: reloadCloudflareBuilds,
    requested: cloudflareWorkerIds.length > 0,
  });
  const convexBuildAccess =
    cloudflareWorkerIds.length === 0
      ? {
          state: "loaded" as const,
          observations: [],
          refreshFailed: false,
          reload: reloadCloudflareConvexBuildAccess,
        }
      : !cloudflareBuildsQuery.data
        ? cloudflareBuildsQuery.isError
          ? { state: "failed" as const, reload: reloadCloudflareBuilds }
          : cloudflareLastWriteAt !== undefined
            ? { state: "checking" as const }
            : { state: "loading" as const }
        : cloudflareBuildAccessTargets.length === 0
          ? {
              state: "loaded" as const,
              observations: [],
              refreshFailed: false,
              reload: reloadCloudflareBuilds,
            }
          : providerObservationState({
              data: cloudflareConvexBuildAccessQuery.data,
              isError: cloudflareConvexBuildAccessQuery.isError,
              isRefetchError: cloudflareConvexBuildAccessQuery.isRefetchError,
              lastWriteAt: cloudflareLastWriteAt,
              reload: reloadCloudflareConvexBuildAccess,
              requested: true,
            });
  const convex = providerObservationState({
    data: convexQuery.data,
    isError: convexQuery.isError,
    isRefetchError: convexQuery.isRefetchError,
    lastWriteAt: convexLastWriteAt,
    reload: reloadConvex,
    requested: convexProjectTargets.length > 0,
  });

  const alchemy: RepositoryProviderObservationState<RepositoryAlchemyStacks> =
    alchemyState.state === "loaded"
      ? {
          state: "loaded",
          observations:
            alchemyState.observation.store === "found" && alchemyState.observation.stacks.length > 0
              ? [alchemyState.observation]
              : [],
          refreshFailed: alchemyState.refreshFailed,
          reload: alchemyState.reload,
        }
      : alchemyState;

  return {
    cloudflare: {
      workers,
      builds,
      convexBuildAccess,
    },
    convex,
    alchemy,
    alchemyState,
  };
}
