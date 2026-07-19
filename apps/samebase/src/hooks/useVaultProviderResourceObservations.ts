import { useQueries } from "@tanstack/react-query";
import { useAction } from "convex/react";

import { api } from "../../convex/_generated/api";

const PROVIDER_RESOURCE_OBSERVATION_STALE_MS = 60_000;
const PROVIDER_RESOURCE_OBSERVATION_CACHE_MS = 5 * 60_000;

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

function buildResourceIdentity(vault: VaultDashboardVault) {
  return {
    cloudflareWorkers: vault.cloudflareWorkers.map((worker) => [
      worker.appRoot,
      worker.accountId,
      worker.workerName,
      worker.workerTag,
    ]),
    convexDeployments: vault.convexDeployments.map((deployment) => [
      deployment.appRoot,
      deployment.projectId,
      deployment.deploymentName,
    ]),
  };
}

function buildProviderObservationLifecycle(providerSetup: VaultDashboardVault["providerSetup"]) {
  switch (providerSetup.status) {
    case "running":
    case "failed":
      return [providerSetup.status, providerSetup.runId] as const;
    case "ready":
    case "not_applicable":
      return [providerSetup.status] as const;
  }
  providerSetup satisfies never;
}

export function useVaultProviderResourceObservations(
  vaults: VaultDashboardVault[] | undefined,
): VaultDashboardVault[] | undefined {
  const observeVaultProviderResources = useAction(
    api.vault.providerResourceObservations.observeVaultProviderResources,
  );
  const observationQueries = useQueries({
    queries: (vaults ?? []).map((vault) => ({
      queryKey: [
        "vault-provider-resources",
        vault._id,
        buildResourceIdentity(vault),
        buildProviderObservationLifecycle(vault.providerSetup),
      ] as const,
      queryFn: () => observeVaultProviderResources({ vaultId: vault._id }),
      enabled:
        vault.providerSetup.status !== "running" &&
        (vault.cloudflareWorkers.length > 0 || vault.convexDeployments.length > 0),
      staleTime: PROVIDER_RESOURCE_OBSERVATION_STALE_MS,
      gcTime: PROVIDER_RESOURCE_OBSERVATION_CACHE_MS,
      refetchOnMount: "always" as const,
      retry: false,
    })),
  });

  if (!vaults) {
    return undefined;
  }

  return vaults.map((vault, index) => {
    const query = observationQueries[index];
    const observations = query.data;
    const failureObservedAt = query.errorUpdatedAt || Date.now();
    return {
      ...vault,
      convexDeployments: vault.convexDeployments.map((deployment) => ({
        ...deployment,
        observation:
          observations?.convexDeployments.find(
            (candidate) =>
              candidate.appRoot === deployment.appRoot &&
              candidate.projectId === deployment.projectId &&
              candidate.deploymentName === deployment.deploymentName,
          )?.observation ??
          (query.isError
            ? {
                state: "failed" as const,
                observedAt: failureObservedAt,
                reason: "provider_failure" as const,
              }
            : { state: "loading" as const }),
      })),
      cloudflareWorkers: vault.cloudflareWorkers.map((worker) => ({
        ...worker,
        observation:
          observations?.cloudflareWorkers.find(
            (candidate) =>
              candidate.appRoot === worker.appRoot &&
              candidate.accountId === worker.accountId &&
              candidate.workerName === worker.workerName &&
              candidate.workerTag === worker.workerTag,
          )?.observation ??
          (query.isError
            ? {
                state: "failed" as const,
                observedAt: failureObservedAt,
                reason: "provider_failure" as const,
              }
            : { state: "loading" as const }),
      })),
    };
  });
}
