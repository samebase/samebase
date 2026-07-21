import type { api } from "../../../convex/_generated/api";
import { getConvexConfigRootDirectory } from "../../../shared/convexConfigPath";
import type {
  VaultCloudflareProviderObservationState,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "./useVaultProviderObservations";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

export type VaultBranchProductionLinkProvider = "cloudflare" | "convex";

export type VaultBranchProductionLink = {
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  title: string;
};

export type VaultBranchProductionRoot = {
  rootDirectory: string;
  links: readonly VaultBranchProductionLink[];
};

type VaultBranchProductionLinkInput = {
  rootDirectory: string;
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  sortKey: string;
  title: string;
};

function buildVaultBranchProductionRoots(
  links: VaultBranchProductionLinkInput[],
): VaultBranchProductionRoot[] {
  const linksByRoot = new Map<string, VaultBranchProductionLinkInput[]>();

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
    .map(([rootDirectory, rootLinks]) => {
      return {
        rootDirectory,
        links: [...rootLinks]
          .sort(
            (left, right) =>
              left.provider.localeCompare(right.provider) ||
              left.sortKey.localeCompare(right.sortKey) ||
              left.href.localeCompare(right.href),
          )
          .map((link) => ({
            href: link.href,
            label: link.label,
            provider: link.provider,
            title: link.title,
          })),
      };
    });
}

function buildVaultBranchProductionUrlLabel(url: string): string {
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

export function buildVaultProductionRoots({
  cloudflareObservations,
  convexObservations,
  vault,
}: {
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  vault: VaultDashboardVault;
}): VaultBranchProductionRoot[] {
  const workerObservations = cloudflareObservations.workers;
  const buildsObservations = cloudflareObservations.builds;
  const cloudflareLinks: VaultBranchProductionLinkInput[] =
    workerObservations.state === "loaded" && buildsObservations.state === "loaded"
      ? vault.cloudflareWorkers.flatMap((worker) => {
          const observation = workerObservations.observations.find(
            (candidate) => candidate.workerId === worker.workerId,
          );
          const buildsObservation = buildsObservations.observations.find(
            (candidate) => candidate.workerId === worker.workerId,
          );
          if (
            observation?.state !== "available" ||
            observation.workersDev.state !== "enabled" ||
            buildsObservation?.state !== "available" ||
            buildsObservation.repository.state !== "ready"
          ) {
            return [];
          }
          const rootDirectory = buildsObservation.repository.rootDirectory;
          return [
            {
              rootDirectory,
              href: observation.workersDev.url,
              label: buildVaultBranchProductionUrlLabel(observation.workersDev.url),
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
  const convexLinks: VaultBranchProductionLinkInput[] =
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
              rootDirectory: getConvexConfigRootDirectory(project.convexConfigPath),
              href: buildConvexDeploymentDashboardUrl(provider, deployment.deploymentName),
              label: `Production: ${deployment.deploymentName}`,
              provider: "convex" as const,
              sortKey: deployment.deploymentName,
              title: `Open production Convex deployment ${deployment.deploymentName}`,
            },
          ];
        })
      : [];

  return buildVaultBranchProductionRoots([...cloudflareLinks, ...convexLinks]);
}
