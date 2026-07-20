import type { api } from "../../../convex/_generated/api";
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

export type VaultBranchProductionApp = {
  appId: string;
  rootDirectory: string;
  links: readonly VaultBranchProductionLink[];
};

type VaultBranchProductionLinkInput = {
  appId: string;
  rootDirectory: string;
  href: string;
  label: string;
  provider: VaultBranchProductionLinkProvider;
  sortKey: string;
  title: string;
};

function buildVaultBranchProductionApps(
  links: VaultBranchProductionLinkInput[],
): VaultBranchProductionApp[] {
  const linksByAppId = new Map<string, VaultBranchProductionLinkInput[]>();

  for (const link of links) {
    linksByAppId.set(link.appId, [...(linksByAppId.get(link.appId) ?? []), link]);
  }

  return [...linksByAppId.entries()]
    .sort(([, leftLinks], [, rightLinks]) => {
      const left = leftLinks[0];
      const right = rightLinks[0];
      if (left.rootDirectory === right.rootDirectory) {
        return left.appId.localeCompare(right.appId);
      }
      if (left.rootDirectory === "/") {
        return -1;
      }
      if (right.rootDirectory === "/") {
        return 1;
      }
      return left.rootDirectory.localeCompare(right.rootDirectory);
    })
    .map(([appId, appLinks]) => {
      const firstLink = appLinks[0];
      return {
        appId,
        rootDirectory: firstLink.rootDirectory,
        links: [...appLinks]
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
  observation: Extract<VaultConvexProjectObservation, { state: "available" }>,
  deploymentName: string,
): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(observation.teamSlug)}/${encodeURIComponent(observation.projectSlug)}/${encodeURIComponent(deploymentName)}`;
}

export function buildVaultProductionApps({
  cloudflareObservations,
  convexObservations,
  vault,
}: {
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  vault: VaultDashboardVault;
}): VaultBranchProductionApp[] {
  const appsById = new Map(vault.apps.map((app) => [app.appId, app]));
  const workerObservations = cloudflareObservations.workers;
  const cloudflareLinks: VaultBranchProductionLinkInput[] =
    workerObservations.state === "loaded"
      ? vault.cloudflareWorkers.flatMap((worker) => {
          const app = appsById.get(worker.appId);
          const observation = workerObservations.observations.find(
            (candidate) => candidate.workerId === worker.workerId,
          );
          if (
            !app ||
            observation?.state !== "available" ||
            observation.workersDev.state !== "enabled"
          ) {
            return [];
          }
          return [
            {
              appId: app.appId,
              rootDirectory: app.rootDirectory,
              href: observation.workersDev.url,
              label: buildVaultBranchProductionUrlLabel(observation.workersDev.url),
              provider: "cloudflare" as const,
              sortKey: worker.workerName,
              title:
                app.rootDirectory === "/"
                  ? "Open production app"
                  : `Open production app for ${app.rootDirectory}`,
            },
          ];
        })
      : [];
  const convexLinks: VaultBranchProductionLinkInput[] =
    convexObservations.state === "loaded"
      ? vault.convexProjects.flatMap((project) => {
          const app = appsById.get(project.appId);
          const observation = convexObservations.observations.find(
            (candidate) => candidate.convexProjectId === project.convexProjectId,
          );
          if (
            !app ||
            observation?.state !== "available" ||
            observation.productionDeployment.state !== "available"
          ) {
            return [];
          }
          const deployment = observation.productionDeployment;
          return [
            {
              appId: app.appId,
              rootDirectory: app.rootDirectory,
              href: buildConvexDeploymentDashboardUrl(observation, deployment.deploymentName),
              label: `Production: ${deployment.deploymentName}`,
              provider: "convex" as const,
              sortKey: deployment.deploymentName,
              title: `Open production Convex deployment ${deployment.deploymentName}`,
            },
          ];
        })
      : [];

  return buildVaultBranchProductionApps([...cloudflareLinks, ...convexLinks]);
}
