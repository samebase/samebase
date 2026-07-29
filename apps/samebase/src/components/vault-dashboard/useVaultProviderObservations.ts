import { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { vaultExternalDataQueryKey } from "@/lib/vaultExternalDataQueryKey";

export type VaultCloudflareWorkerObservation =
  (typeof api.vault.providerObservations.observeCloudflareWorkers)["_returnType"][number];
export type VaultCloudflareWorkerBuildsObservation =
  (typeof api.vault.providerObservations.observeCloudflareWorkerBuilds)["_returnType"][number];
export type VaultCloudflareWorkerConvexBuildAccessObservation =
  (typeof api.vault.providerObservations.observeCloudflareWorkerConvexBuildAccess)["_returnType"][number];
export type VaultConvexProjectObservation =
  (typeof api.vault.providerObservations.observeConvexProjects)["_returnType"][number];

export type VaultProviderObservationState<TObservation> =
  | { state: "loading" }
  | { state: "checking" }
  | {
      state: "loaded";
      observations: readonly TObservation[];
      refreshFailed: boolean;
      reload: () => void;
    }
  | { state: "failed"; reload: () => void };

export type VaultCloudflareProviderObservationState = {
  workers: VaultProviderObservationState<VaultCloudflareWorkerObservation>;
  builds: VaultProviderObservationState<VaultCloudflareWorkerBuildsObservation>;
  convexBuildAccess: VaultProviderObservationState<VaultCloudflareWorkerConvexBuildAccessObservation>;
};

type VaultProviderObservationTarget = Pick<UserVaultResult, "_id" | "providerWrite"> & {
  cloudflareWorkers: readonly Pick<UserVaultResult["cloudflareWorkers"][number], "workerId">[];
  convexProjects: readonly Pick<
    UserVaultResult["convexProjects"][number],
    "codeLocation" | "convexProjectId" | "projectId" | "teamId"
  >[];
};

const PROVIDER_OBSERVATION_STALE_TIME_MS = 60 * 1000;
const PROVIDER_OBSERVATION_GC_TIME_MS = 5 * 60 * 1000;

function providerObservationState<TObservation>({
  checking,
  data,
  isError,
  isRefetchError,
  lastWriteAt,
  reload,
  requested,
}: {
  checking: boolean;
  data: readonly TObservation[] | undefined;
  isError: boolean;
  isRefetchError: boolean;
  lastWriteAt: number | undefined;
  reload: () => void;
  requested: boolean;
}): VaultProviderObservationState<TObservation> {
  if (!requested) {
    return { state: "loaded", observations: [], refreshFailed: false, reload };
  }
  if (checking) {
    return { state: "checking" };
  }
  if (data) {
    return { state: "loaded", observations: data, refreshFailed: isRefetchError, reload };
  }
  if (!isError && lastWriteAt !== undefined) {
    return { state: "checking" };
  }
  return isError ? { state: "failed", reload } : { state: "loading" };
}

export function useVaultProviderObservations(vault: VaultProviderObservationTarget | null): {
  cloudflare: VaultCloudflareProviderObservationState;
  convex: VaultProviderObservationState<VaultConvexProjectObservation>;
} {
  const observeCloudflareWorkers = useAction(
    api.vault.providerObservations.observeCloudflareWorkers,
  );
  const observeCloudflareWorkerBuilds = useAction(
    api.vault.providerObservations.observeCloudflareWorkerBuilds,
  );
  const observeCloudflareWorkerConvexBuildAccess = useAction(
    api.vault.providerObservations.observeCloudflareWorkerConvexBuildAccess,
  );
  const observeConvexProjects = useAction(api.vault.providerObservations.observeConvexProjects);
  const vaultId = vault?._id;
  const cloudflareLastWriteAt = vault?.providerWrite.lastWriteAt.cloudflare;
  const convexLastWriteAt = vault?.providerWrite.lastWriteAt.convex;
  const activeManualWrite =
    vault?.providerWrite.status === "active" &&
    vault.providerWrite.owner.kind === "manual_provider_write"
      ? vault.providerWrite
      : null;
  const cloudflareWorkerIds = [...(vault?.cloudflareWorkers ?? [])]
    .map((worker) => worker.workerId)
    .sort((left, right) => left.localeCompare(right));
  const convexProjectTargets = [...(vault?.convexProjects ?? [])]
    .map((project) => ({
      codeLocation: project.codeLocation,
      convexProjectId: project.convexProjectId,
      projectId: project.projectId,
      teamId: project.teamId,
    }))
    .sort((left, right) => left.convexProjectId.localeCompare(right.convexProjectId));

  const cloudflareWorkersQuery = useQuery({
    queryKey: [
      ...vaultExternalDataQueryKey(vaultId),
      "cloudflare-workers",
      cloudflareWorkerIds,
      cloudflareLastWriteAt,
    ],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Cloudflare Workers.");
      }
      return await observeCloudflareWorkers({ vaultId });
    },
    enabled: Boolean(vaultId && cloudflareWorkerIds.length > 0),
    retry: false,
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });
  const cloudflareBuildsQuery = useQuery({
    queryKey: [
      ...vaultExternalDataQueryKey(vaultId),
      "cloudflare-worker-builds",
      cloudflareWorkerIds,
      cloudflareLastWriteAt,
    ],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Cloudflare Workers Builds.");
      }
      return await observeCloudflareWorkerBuilds({ vaultId });
    },
    enabled: Boolean(vaultId && cloudflareWorkerIds.length > 0),
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
              productionTriggerUuid: observation.builds.productionTriggerUuid,
              previewTriggerUuid: observation.builds.previewTriggerUuid,
            },
          ]
        : [],
    )
    .sort((left, right) => left.workerId.localeCompare(right.workerId));
  const cloudflareConvexBuildAccessQuery = useQuery({
    queryKey: [
      ...vaultExternalDataQueryKey(vaultId),
      "cloudflare-worker-convex-build-access",
      cloudflareBuildAccessTargets,
      convexProjectTargets,
      cloudflareLastWriteAt,
    ],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Convex build access.");
      }
      if (cloudflareBuildAccessTargets.length === 0) {
        return [];
      }
      return await observeCloudflareWorkerConvexBuildAccess({
        vaultId,
        targets: cloudflareBuildAccessTargets,
      });
    },
    enabled: Boolean(vaultId && cloudflareBuildAccessTargets.length > 0),
    retry: false,
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });
  const convexQuery = useQuery({
    queryKey: [
      ...vaultExternalDataQueryKey(vaultId),
      "convex",
      convexProjectTargets,
      convexLastWriteAt,
    ],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Convex projects.");
      }
      return await observeConvexProjects({ vaultId });
    },
    enabled: Boolean(vaultId && convexProjectTargets.length > 0),
    retry: false,
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });

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
    checking: activeManualWrite?.affectedProviders.includes("cloudflare") === true,
    data: cloudflareWorkersQuery.data,
    isError: cloudflareWorkersQuery.isError,
    isRefetchError: cloudflareWorkersQuery.isRefetchError,
    lastWriteAt: cloudflareLastWriteAt,
    reload: reloadCloudflareWorkers,
    requested: cloudflareWorkerIds.length > 0,
  });
  const builds = providerObservationState({
    checking: activeManualWrite?.affectedProviders.includes("cloudflare") === true,
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
      : activeManualWrite?.affectedProviders.includes("cloudflare") === true
        ? { state: "checking" as const }
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
                checking: false,
                data: cloudflareConvexBuildAccessQuery.data,
                isError: cloudflareConvexBuildAccessQuery.isError,
                isRefetchError: cloudflareConvexBuildAccessQuery.isRefetchError,
                lastWriteAt: cloudflareLastWriteAt,
                reload: reloadCloudflareConvexBuildAccess,
                requested: true,
              });
  const convex = providerObservationState({
    checking: activeManualWrite?.affectedProviders.includes("convex") === true,
    data: convexQuery.data,
    isError: convexQuery.isError,
    isRefetchError: convexQuery.isRefetchError,
    lastWriteAt: convexLastWriteAt,
    reload: reloadConvex,
    requested: convexProjectTargets.length > 0,
  });

  return {
    cloudflare: {
      workers,
      builds,
      convexBuildAccess,
    },
    convex,
  };
}
