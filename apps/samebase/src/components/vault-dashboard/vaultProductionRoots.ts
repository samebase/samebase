import type { api } from "../../../convex/_generated/api";
import { getConvexCodeRootDirectory } from "../../../shared/convexCodeLocation";
import type {
  VaultCloudflareProviderObservationState,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "./useVaultProviderObservations";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

export type VaultProductionLinkProvider = "cloudflare" | "convex";

type VaultProductionLink = {
  href: string;
  label: string;
  provider: VaultProductionLinkProvider;
  title: string;
};

export type VaultProductionRoot = {
  rootDirectory: string;
  links: readonly VaultProductionLink[];
};

type VaultProductionLinkInput = VaultProductionLink & {
  rootDirectory: string;
  sortKey: string;
};

function groupVaultProductionLinks(
  links: readonly VaultProductionLinkInput[],
): VaultProductionRoot[] {
  const linksByRoot = new Map<string, VaultProductionLinkInput[]>();

  for (const link of links) {
    linksByRoot.set(link.rootDirectory, [...(linksByRoot.get(link.rootDirectory) ?? []), link]);
  }

  return [...linksByRoot.entries()]
    .sort(([leftRoot], [rightRoot]) => {
      if (leftRoot === rightRoot) {
        return 0;
      }
      if (leftRoot === "/") {
        return -1;
      }
      if (rightRoot === "/") {
        return 1;
      }
      return leftRoot.localeCompare(rightRoot);
    })
    .map(([rootDirectory, rootLinks]) => ({
      rootDirectory,
      links: [...rootLinks]
        .sort(
          (left, right) =>
            left.provider.localeCompare(right.provider) ||
            left.sortKey.localeCompare(right.sortKey) ||
            left.href.localeCompare(right.href),
        )
        .map(({ href, label, provider, title }) => ({ href, label, provider, title })),
    }));
}

function buildProductionUrlLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

function buildConvexDeploymentDashboardUrl(
  project: { projectSlug: string; teamSlug: string },
  deploymentName: string,
): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(project.teamSlug)}/${encodeURIComponent(project.projectSlug)}/${encodeURIComponent(deploymentName)}`;
}

/**
 * Joins durable provider attachments with current provider observations for the
 * production-resource group on the default-branch surface. This derives
 * presentation data only; it does not persist provider facts or create a
 * branch/resource model.
 */
export function buildVaultProductionRoots({
  cloudflareObservations,
  convexObservations,
  vault,
}: {
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  vault: VaultDashboardVault;
}): VaultProductionRoot[] {
  const workerObservations = cloudflareObservations.workers;
  const buildsObservations = cloudflareObservations.builds;
  const cloudflareLinks: VaultProductionLinkInput[] =
    workerObservations.state === "loaded" && buildsObservations.state === "loaded"
      ? vault.cloudflareWorkers.flatMap((worker) => {
          const workerObservation = workerObservations.observations.find(
            (candidate) => candidate.workerId === worker.workerId,
          );
          const buildsObservation = buildsObservations.observations.find(
            (candidate) => candidate.workerId === worker.workerId,
          );
          if (
            workerObservation?.state !== "available" ||
            workerObservation.workersDev.state !== "enabled" ||
            buildsObservation?.state !== "available" ||
            buildsObservation.repository.state !== "ready"
          ) {
            return [];
          }

          const rootDirectory = buildsObservation.repository.rootDirectory;
          return [
            {
              rootDirectory,
              href: workerObservation.workersDev.url,
              label: buildProductionUrlLabel(workerObservation.workersDev.url),
              provider: "cloudflare" as const,
              sortKey: worker.workerName,
              title:
                rootDirectory === "/"
                  ? "Open production app"
                  : `Open production app for ${rootDirectory}`,
            },
          ];
        })
      : [];
  const convexLinks: VaultProductionLinkInput[] =
    convexObservations.state === "loaded"
      ? vault.convexProjects.flatMap((project) => {
          const observation = convexObservations.observations.find(
            (candidate) => candidate.convexProjectId === project.convexProjectId,
          );
          const provider = observation?.provider;
          if (
            !provider ||
            (provider.state !== "current" && provider.state !== "moved") ||
            provider.productionDeployment.state !== "available"
          ) {
            return [];
          }

          const deployment = provider.productionDeployment;
          return [
            {
              rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
              href: buildConvexDeploymentDashboardUrl(provider, deployment.deploymentName),
              label: deployment.deploymentName,
              provider: "convex" as const,
              sortKey: deployment.deploymentName,
              title: `Open production Convex deployment ${deployment.deploymentName}`,
            },
          ];
        })
      : [];

  return groupVaultProductionLinks([...cloudflareLinks, ...convexLinks]);
}
