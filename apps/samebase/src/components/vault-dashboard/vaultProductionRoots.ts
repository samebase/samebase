import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getConvexCodeRootDirectory } from "../../../shared/convexCodeLocation";
import type {
  VaultCloudflareProviderObservationState,
  VaultCloudflareWorkerBuildsObservation,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "./useVaultProviderObservations";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

export type VaultProductionLink =
  | {
      provider: "cloudflare";
      workerId: Id<"vaultCloudflareWorkers">;
      workerName: string;
      build:
        | { state: "available"; buildState: CloudflareBuildState; logsUrl: string }
        | { state: "absent" }
        | { state: "unavailable" };
      href: string;
      label: string;
      title: string;
    }
  | {
      provider: "convex";
      convexProjectId: Id<"vaultConvexProjects">;
      href: string;
      label: string;
      title: string;
    };

export type VaultProductionLinkProvider = VaultProductionLink["provider"];

export type VaultProductionRoot = {
  rootDirectory: string;
  links: readonly VaultProductionLink[];
};

type VaultProductionLinkInput = VaultProductionLink & {
  rootDirectory: string;
  sortKey: string;
};

type CloudflareBuildState = Extract<
  Extract<VaultCloudflareWorkerBuildsObservation, { state: "available" }>["productionBuild"],
  { state: "available" }
>["buildState"];

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
        .map((link) =>
          link.provider === "convex"
            ? {
                provider: link.provider,
                convexProjectId: link.convexProjectId,
                href: link.href,
                label: link.label,
                title: link.title,
              }
            : {
                provider: link.provider,
                workerId: link.workerId,
                workerName: link.workerName,
                build: link.build,
                href: link.href,
                label: link.label,
                title: link.title,
              },
        ),
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

function buildCloudflareBuildLogsUrl(args: {
  accountId: string;
  workerName: string;
  buildUuid: string;
}): string {
  return `https://dash.cloudflare.com/${encodeURIComponent(args.accountId)}/workers/services/view/${encodeURIComponent(args.workerName)}/production/builds/${encodeURIComponent(args.buildUuid)}`;
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
            buildsObservation?.state !== "available" ||
            buildsObservation.repository.state !== "ready"
          ) {
            return [];
          }

          const rootDirectory = buildsObservation.repository.rootDirectory;
          const title =
            rootDirectory === "/"
              ? "Open production app"
              : `Open production app for ${rootDirectory}`;
          const build =
            buildsObservation.productionBuild.state === "available"
              ? {
                  state: "available" as const,
                  buildState: buildsObservation.productionBuild.buildState,
                  logsUrl: buildCloudflareBuildLogsUrl({
                    accountId: worker.accountId,
                    workerName: worker.workerName,
                    buildUuid: buildsObservation.productionBuild.uuid,
                  }),
                }
              : buildsObservation.productionBuild;
          const customDomainLinks = workerObservation.customDomains.map((hostname) => ({
            rootDirectory,
            workerId: worker.workerId,
            workerName: worker.workerName,
            build,
            href: `https://${hostname}`,
            label: hostname,
            provider: "cloudflare" as const,
            sortKey: `0:${hostname}`,
            title,
          }));
          const workersDevLinks =
            workerObservation.workersDev.state === "enabled"
              ? [
                  {
                    rootDirectory,
                    workerId: worker.workerId,
                    workerName: worker.workerName,
                    build,
                    href: workerObservation.workersDev.url,
                    label: buildProductionUrlLabel(workerObservation.workersDev.url),
                    provider: "cloudflare" as const,
                    sortKey: `1:${worker.workerName}`,
                    title,
                  },
                ]
              : [];

          return [...customDomainLinks, ...workersDevLinks];
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
              provider: "convex" as const,
              convexProjectId: project.convexProjectId,
              rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
              href: buildConvexDeploymentDashboardUrl(provider, deployment.deploymentName),
              label: deployment.deploymentName,
              sortKey: deployment.deploymentName,
              title: `Open production Convex deployment ${deployment.deploymentName}`,
            },
          ];
        })
      : [];

  return groupVaultProductionLinks([...cloudflareLinks, ...convexLinks]);
}
