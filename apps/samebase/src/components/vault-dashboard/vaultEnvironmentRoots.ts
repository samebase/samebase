import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PullRequestResources,
  PullRequestWorkerResource,
} from "../../../convex/vault/pullRequestResources";
import { getConvexCodeRootDirectory } from "../../../shared/convexCodeLocation";
import { buildVaultDatabaseRoute, buildVaultSchemaRoute } from "@/lib/vaultRoutes";
import type {
  VaultCloudflareProviderObservationState,
  VaultCloudflareWorkerBuildsObservation,
  VaultConvexProjectObservation,
  VaultProviderObservationState,
} from "./useVaultProviderObservations";

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

export type VaultEnvironmentAction =
  | { destination: "external"; href: string; label: string }
  | { destination: "samebase"; href: string; label: string };

export type VaultEnvironmentWorker = {
  workerName: string;
  build:
    | { state: "available"; buildState: VaultEnvironmentBuildState; logsUrl: string }
    | { state: "absent" }
    | { state: "unavailable" };
  destination:
    | { state: "available"; href: string; label: string; title: string }
    | { state: "absent" };
  actions: readonly VaultEnvironmentAction[];
};

type VaultEnvironmentBuildState = Extract<
  PullRequestWorkerResource,
  { state: "available" }
>["cloudflareBuild"]["state"];

type VaultProductionBuildState = Extract<
  Extract<
    Extract<VaultCloudflareWorkerBuildsObservation, { state: "available" }>["builds"],
    { state: "connected" }
  >["productionBuild"],
  { state: "available" }
>["buildState"];

export type VaultEnvironmentResource =
  | {
      kind: "destination";
      id: string;
      actions: readonly VaultEnvironmentAction[];
      href: string;
      label: string;
      provider: "convex";
      title: string;
    }
  | {
      kind: "convex_loading";
      id: Id<"vaultConvexProjects">;
    }
  | {
      kind: "cloudflare_worker";
      id: Id<"vaultCloudflareWorkers">;
      worker: VaultEnvironmentWorker;
    };

export type VaultEnvironmentRoot = {
  rootDirectory: string;
  resources: readonly VaultEnvironmentResource[];
};

type VaultEnvironmentResourceInput = {
  resource: VaultEnvironmentResource;
  rootDirectory: string;
  sortKey: string;
};

function groupVaultEnvironmentResources(
  inputs: readonly VaultEnvironmentResourceInput[],
): VaultEnvironmentRoot[] {
  const inputsByRoot = new Map<string, VaultEnvironmentResourceInput[]>();

  for (const input of inputs) {
    inputsByRoot.set(input.rootDirectory, [
      ...(inputsByRoot.get(input.rootDirectory) ?? []),
      input,
    ]);
  }

  return [...inputsByRoot.entries()]
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
    .map(([rootDirectory, rootInputs]) => ({
      rootDirectory,
      resources: [...rootInputs]
        .sort(
          (left, right) =>
            left.sortKey.localeCompare(right.sortKey) ||
            left.resource.id.localeCompare(right.resource.id),
        )
        .map((input) => input.resource),
    }));
}

function buildProductionUrlLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

export function buildProductionEnvironmentRoots({
  branch,
  cloudflareObservations,
  convexObservations,
  owner,
  repoName,
  schemaGraphEnabled,
  vault,
}: {
  branch: string;
  cloudflareObservations: VaultCloudflareProviderObservationState;
  convexObservations: VaultProviderObservationState<VaultConvexProjectObservation>;
  owner: string;
  repoName: string;
  schemaGraphEnabled: boolean;
  vault: VaultDashboardVault;
}): VaultEnvironmentRoot[] {
  const workerObservations = cloudflareObservations.workers;
  const buildsObservations = cloudflareObservations.builds;
  const cloudflareWorkers: VaultEnvironmentResourceInput[] =
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
          const destinations = [
            ...workerObservation.customDomains.map((hostname) => ({
              href: `https://${hostname}`,
              label: hostname,
              sortKey: `0:${hostname}`,
            })),
            ...(workerObservation.workersDev.state === "enabled"
              ? [
                  {
                    href: workerObservation.workersDev.url,
                    label: buildProductionUrlLabel(workerObservation.workersDev.url),
                    sortKey: `1:${worker.workerName}`,
                  },
                ]
              : []),
          ].sort(
            (left, right) =>
              left.sortKey.localeCompare(right.sortKey) || left.href.localeCompare(right.href),
          );
          const primary = destinations.at(0);
          if (!primary) {
            return [];
          }

          const productionBuild =
            buildsObservation.builds.state === "connected"
              ? buildsObservation.builds.productionBuild
              : ({ state: "absent" } as const);
          const build:
            | { state: "available"; buildState: VaultProductionBuildState; logsUrl: string }
            | { state: "absent" }
            | { state: "unavailable" } =
            productionBuild.state === "available"
              ? {
                  state: "available",
                  buildState: productionBuild.buildState,
                  logsUrl: productionBuild.logsUrl,
                }
              : productionBuild;

          return [
            {
              rootDirectory,
              sortKey: `0:${worker.workerName}:${worker.workerId}`,
              resource: {
                kind: "cloudflare_worker",
                id: worker.workerId,
                worker: {
                  workerName: worker.workerName,
                  build,
                  destination: {
                    state: "available",
                    href: primary.href,
                    label: primary.label,
                    title,
                  },
                  actions: destinations.slice(1).map((destination) => ({
                    destination: "external",
                    href: destination.href,
                    label: destination.label,
                  })),
                },
              },
            },
          ];
        })
      : [];
  const convexDeployments: VaultEnvironmentResourceInput[] =
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
          const href = deployment.dashboardUrl;
          return [
            {
              rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
              sortKey: `1:${deployment.deploymentName}:${href}`,
              resource: {
                kind: "destination",
                id: `convex:${href}`,
                actions: [
                  {
                    destination: "samebase",
                    href: buildVaultDatabaseRoute({
                      owner,
                      repoName,
                      branch,
                      convexProjectId: project.convexProjectId,
                    }),
                    label: "Data",
                  },
                  ...(schemaGraphEnabled
                    ? [
                        {
                          destination: "samebase" as const,
                          href: buildVaultSchemaRoute({
                            owner,
                            repoName,
                            branch,
                            convexProjectId: project.convexProjectId,
                          }),
                          label: "Schema",
                        },
                      ]
                    : []),
                ],
                href,
                label: deployment.deploymentName,
                provider: "convex",
                title: `Open production Convex deployment ${deployment.deploymentName}`,
              },
            },
          ];
        })
      : [];
  const convexLoading =
    convexObservations.state === "loading"
      ? vault.convexProjects.map((project) => ({
          rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
          sortKey: `1:${project.convexProjectId}`,
          resource: {
            kind: "convex_loading" as const,
            id: project.convexProjectId,
          },
        }))
      : [];

  return groupVaultEnvironmentResources([
    ...cloudflareWorkers,
    ...convexDeployments,
    ...convexLoading,
  ]);
}

export function buildPullRequestEnvironmentRoots(
  resources: PullRequestResources,
): VaultEnvironmentRoot[] {
  const inputs = resources.workers.flatMap((worker) => {
    const rootDirectory = worker.state === "unavailable" ? "Needs attention" : worker.rootDirectory;
    const workerInput = {
      rootDirectory,
      sortKey: `0:${worker.workerName}:${worker.workerId}`,
      resource: {
        kind: "cloudflare_worker" as const,
        id: worker.workerId,
        worker:
          worker.state === "available"
            ? {
                workerName: worker.workerName,
                build: {
                  state: "available" as const,
                  buildState: worker.cloudflareBuild.state,
                  logsUrl: worker.cloudflareBuild.logsUrl,
                },
                destination:
                  worker.cloudflareBranchPreview.state === "available"
                    ? {
                        state: "available" as const,
                        href: worker.cloudflareBranchPreview.url,
                        label: "Branch preview",
                        title: new URL(worker.cloudflareBranchPreview.url).hostname,
                      }
                    : { state: "absent" as const },
                actions: [],
              }
            : {
                workerName: worker.workerName,
                build:
                  worker.state === "absent"
                    ? { state: "absent" as const }
                    : { state: "unavailable" as const },
                destination: { state: "absent" as const },
                actions: [],
              },
      },
    };

    if (worker.state !== "available" || worker.convexPreview.state !== "available") {
      return [workerInput];
    }

    const preview = worker.convexPreview;
    return [
      workerInput,
      {
        rootDirectory,
        sortKey: `1:${preview.deploymentName}:${worker.workerId}`,
        resource: {
          kind: "destination" as const,
          id: `convex:${worker.workerId}`,
          actions: [
            {
              destination: "external" as const,
              href: `${preview.dashboardUrl}/data`,
              label: "Data",
            },
          ],
          href: preview.dashboardUrl,
          label: preview.deploymentName,
          provider: "convex" as const,
          title: `Open preview Convex deployment ${preview.deploymentName}`,
        },
      },
    ];
  });

  return groupVaultEnvironmentResources(inputs);
}
