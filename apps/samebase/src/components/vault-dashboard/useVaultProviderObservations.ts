import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import type { ConvexCodeLocation } from "../../../shared/convexCodeLocation";
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

type VaultProviderObservationTarget = {
  _id: Id<"vaults">;
  cloudflareWorkers: readonly { workerId: Id<"vaultCloudflareWorkers"> }[];
  convexProjects: readonly {
    codeLocation: ConvexCodeLocation;
    convexProjectId: Id<"vaultConvexProjects">;
    projectId: string;
    teamId: string;
  }[];
};

const PROVIDER_OBSERVATION_STALE_TIME_MS = 60 * 1000;
const PROVIDER_OBSERVATION_GC_TIME_MS = 5 * 60 * 1000;

function providerObservationState<TObservation>({
  data,
  isError,
  isRefetchError,
  reload,
  requested,
}: {
  data: readonly TObservation[] | undefined;
  isError: boolean;
  isRefetchError: boolean;
  reload: () => void;
  requested: boolean;
}): VaultProviderObservationState<TObservation> {
  if (!requested) {
    return { state: "loaded", observations: [], refreshFailed: false, reload };
  }
  if (data) {
    return { state: "loaded", observations: data, refreshFailed: isRefetchError, reload };
  }
  return isError ? { state: "failed", reload } : { state: "loading" };
}

export function useVaultProviderObservations(vault: VaultProviderObservationTarget | null): {
  cloudflare: VaultCloudflareProviderObservationState;
  convex: VaultProviderObservationState<VaultConvexProjectObservation>;
  invalidateExternalData: () => Promise<void>;
} {
  const queryClient = useQueryClient();
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
    queryKey: [...vaultExternalDataQueryKey(vaultId), "cloudflare-workers", cloudflareWorkerIds],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Cloudflare Workers.");
      }
      return await observeCloudflareWorkers({ vaultId });
    },
    enabled: Boolean(vaultId && cloudflareWorkerIds.length > 0),
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });
  const cloudflareBuildsQuery = useQuery({
    queryKey: [
      ...vaultExternalDataQueryKey(vaultId),
      "cloudflare-worker-builds",
      cloudflareWorkerIds,
    ],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Cloudflare Workers Builds.");
      }
      return await observeCloudflareWorkerBuilds({ vaultId });
    },
    enabled: Boolean(vaultId && cloudflareWorkerIds.length > 0),
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
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
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });
  const convexQuery = useQuery({
    queryKey: [...vaultExternalDataQueryKey(vaultId), "convex", convexProjectTargets],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Convex projects.");
      }
      return await observeConvexProjects({ vaultId });
    },
    enabled: Boolean(vaultId && convexProjectTargets.length > 0),
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
  const invalidateExternalData = async () => {
    await queryClient.invalidateQueries({
      queryKey: vaultExternalDataQueryKey(vaultId),
    });
  };
  const workers = providerObservationState({
    data: cloudflareWorkersQuery.data,
    isError: cloudflareWorkersQuery.isError,
    isRefetchError: cloudflareWorkersQuery.isRefetchError,
    reload: reloadCloudflareWorkers,
    requested: cloudflareWorkerIds.length > 0,
  });
  const builds = providerObservationState({
    data: cloudflareBuildsQuery.data,
    isError: cloudflareBuildsQuery.isError,
    isRefetchError: cloudflareBuildsQuery.isRefetchError,
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
              reload: reloadCloudflareConvexBuildAccess,
              requested: true,
            });
  const convex = providerObservationState({
    data: convexQuery.data,
    isError: convexQuery.isError,
    isRefetchError: convexQuery.isRefetchError,
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
    invalidateExternalData,
  };
}
