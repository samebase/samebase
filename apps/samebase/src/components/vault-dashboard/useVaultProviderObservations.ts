import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";

export type VaultCloudflareWorkerObservation =
  (typeof api.vault.providerObservations.observeCloudflareWorkers)["_returnType"][number];
export type VaultConvexProjectObservation =
  (typeof api.vault.providerObservations.observeConvexProjects)["_returnType"][number];

export type VaultProviderObservationState<TObservation> =
  | { state: "loading" }
  | { state: "loaded"; observations: readonly TObservation[]; reload: () => void }
  | { state: "failed"; reload: () => void };

type VaultProviderObservationTarget = {
  _id: Id<"vaults">;
  cloudflareWorkers: readonly { workerId: Id<"vaultCloudflareWorkers"> }[];
  convexProjects: readonly { convexProjectId: Id<"vaultConvexProjects"> }[];
};

const PROVIDER_OBSERVATION_STALE_TIME_MS = 60 * 1000;
const PROVIDER_OBSERVATION_GC_TIME_MS = 5 * 60 * 1000;

export function useVaultProviderObservations(vault: VaultProviderObservationTarget | null): {
  cloudflare: VaultProviderObservationState<VaultCloudflareWorkerObservation>;
  convex: VaultProviderObservationState<VaultConvexProjectObservation>;
} {
  const observeCloudflareWorkers = useAction(
    api.vault.providerObservations.observeCloudflareWorkers,
  );
  const observeConvexProjects = useAction(api.vault.providerObservations.observeConvexProjects);
  const vaultId = vault?._id;
  const cloudflareWorkerIds = [...(vault?.cloudflareWorkers ?? [])]
    .map((worker) => worker.workerId)
    .sort((left, right) => left.localeCompare(right));
  const convexProjectIds = [...(vault?.convexProjects ?? [])]
    .map((project) => project.convexProjectId)
    .sort((left, right) => left.localeCompare(right));

  const cloudflareQuery = useQuery({
    queryKey: ["vault-provider-observations", "cloudflare", vaultId, cloudflareWorkerIds],
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
  const convexQuery = useQuery({
    queryKey: ["vault-provider-observations", "convex", vaultId, convexProjectIds],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe Convex projects.");
      }
      return await observeConvexProjects({ vaultId });
    },
    enabled: Boolean(vaultId && convexProjectIds.length > 0),
    staleTime: PROVIDER_OBSERVATION_STALE_TIME_MS,
    gcTime: PROVIDER_OBSERVATION_GC_TIME_MS,
  });

  const reloadCloudflare = () => {
    void cloudflareQuery.refetch();
  };
  const reloadConvex = () => {
    void convexQuery.refetch();
  };

  return {
    cloudflare: cloudflareQuery.isError
      ? { state: "failed", reload: reloadCloudflare }
      : cloudflareQuery.data
        ? {
            state: "loaded",
            observations: cloudflareQuery.data,
            reload: reloadCloudflare,
          }
        : { state: "loading" },
    convex: convexQuery.isError
      ? { state: "failed", reload: reloadConvex }
      : convexQuery.data
        ? { state: "loaded", observations: convexQuery.data, reload: reloadConvex }
        : { state: "loading" },
  };
}
