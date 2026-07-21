import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";

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
  | { state: "loaded"; observations: readonly TObservation[]; reload: () => void }
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
    convexConfigPath: string;
    convexProjectId: Id<"vaultConvexProjects">;
    projectId: string;
    teamId: string;
  }[];
};

const PROVIDER_OBSERVATION_STALE_TIME_MS = 60 * 1000;
const PROVIDER_OBSERVATION_GC_TIME_MS = 5 * 60 * 1000;

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
  const cloudflareWorkerIds = [...(vault?.cloudflareWorkers ?? [])]
    .map((worker) => worker.workerId)
    .sort((left, right) => left.localeCompare(right));
  const convexProjectTargets = [...(vault?.convexProjects ?? [])]
    .map((project) => ({
      convexConfigPath: project.convexConfigPath,
      convexProjectId: project.convexProjectId,
      projectId: project.projectId,
      teamId: project.teamId,
    }))
    .sort((left, right) => left.convexProjectId.localeCompare(right.convexProjectId));

  const cloudflareWorkersQuery = useQuery({
    queryKey: ["vault-provider-observations", "cloudflare-workers", vaultId, cloudflareWorkerIds],
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
      "vault-provider-observations",
      "cloudflare-worker-builds",
      vaultId,
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
      "vault-provider-observations",
      "cloudflare-worker-convex-build-access",
      vaultId,
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
    queryKey: ["vault-provider-observations", "convex", vaultId, convexProjectTargets],
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

  return {
    cloudflare: {
      workers: cloudflareWorkersQuery.isError
        ? { state: "failed", reload: reloadCloudflareWorkers }
        : cloudflareWorkersQuery.data
          ? {
              state: "loaded",
              observations: cloudflareWorkersQuery.data,
              reload: reloadCloudflareWorkers,
            }
          : { state: "loading" },
      builds: cloudflareBuildsQuery.isError
        ? { state: "failed", reload: reloadCloudflareBuilds }
        : cloudflareBuildsQuery.data
          ? {
              state: "loaded",
              observations: cloudflareBuildsQuery.data,
              reload: reloadCloudflareBuilds,
            }
          : { state: "loading" },
      convexBuildAccess: cloudflareBuildsQuery.isError
        ? { state: "failed", reload: reloadCloudflareBuilds }
        : !cloudflareBuildsQuery.data
          ? { state: "loading" }
          : cloudflareBuildAccessTargets.length === 0
            ? {
                state: "loaded",
                observations: [],
                reload: reloadCloudflareBuilds,
              }
            : cloudflareConvexBuildAccessQuery.isError
              ? { state: "failed", reload: reloadCloudflareConvexBuildAccess }
              : cloudflareConvexBuildAccessQuery.data
                ? {
                    state: "loaded",
                    observations: cloudflareConvexBuildAccessQuery.data,
                    reload: reloadCloudflareConvexBuildAccess,
                  }
                : { state: "loading" },
    },
    convex: convexQuery.isError
      ? { state: "failed", reload: reloadConvex }
      : convexQuery.data
        ? { state: "loaded", observations: convexQuery.data, reload: reloadConvex }
        : { state: "loading" },
  };
}
