import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PullRequestResources,
  PullRequestWorkerResource,
} from "../../../convex/vault/pullRequestResources";
import { getConvexCodeRootDirectory } from "../../../shared/convexCodeLocation";
import type { ConvexDeploymentRegion } from "../../../shared/convexDeploymentRegions";
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
    | { state: "loading" }
    | { state: "unavailable" };
  destination:
    | { state: "available"; href: string; label: string; title: string }
    | { state: "absent" };
  actions: readonly VaultEnvironmentAction[];
};

type VaultEnvironmentBuildState = Extract<
  PullRequestWorkerResource["cloudflareBuild"],
  { state: "available" }
>["buildState"];

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
      provenance: "production" | "pull_request_branch";
      region?: ConvexDeploymentRegion;
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

export type VaultOtherPreview = {
  id: string;
  destinationLabel: "Branch preview" | "Deploy preview";
  href: string;
  name: string;
  provider: "cloudflare_pages" | "cloudflare_worker" | "netlify";
  setup: { state: "connect"; href: string } | { state: "none" };
};

const vaultOtherPreviewProviderOrder = {
  cloudflare_worker: 0,
  cloudflare_pages: 1,
  netlify: 2,
} as const;

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
  const cloudflareWorkers: VaultEnvironmentResourceInput[] = vault.cloudflareWorkers.map(
    (worker) => {
      const workerObservation =
        workerObservations.state === "loaded"
          ? workerObservations.observations.find(
              (candidate) => candidate.workerId === worker.workerId,
            )
          : undefined;
      const buildsObservation =
        buildsObservations.state === "loaded"
          ? buildsObservations.observations.find(
              (candidate) => candidate.workerId === worker.workerId,
            )
          : undefined;
      const rootDirectory = worker.rootDirectory;
      const title =
        rootDirectory === "/" ? "Open production app" : `Open production app for ${rootDirectory}`;
      const destinations =
        workerObservation?.state === "available"
          ? [
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
            )
          : [];
      const primary = destinations.at(0);

      const productionBuild =
        buildsObservation?.state === "available" && buildsObservation.builds.state === "connected"
          ? buildsObservation.builds.productionBuild
          : buildsObservation?.state === "available"
            ? ({ state: "absent" } as const)
            : buildsObservations.state === "loading" || buildsObservations.state === "checking"
              ? ({ state: "loading" } as const)
              : ({ state: "unavailable" } as const);
      const build:
        | { state: "available"; buildState: VaultProductionBuildState; logsUrl: string }
        | { state: "absent" }
        | { state: "loading" }
        | { state: "unavailable" } =
        productionBuild.state === "available"
          ? {
              state: "available",
              buildState: productionBuild.buildState,
              logsUrl: productionBuild.logsUrl,
            }
          : productionBuild.state === "absent"
            ? { state: "absent" }
            : productionBuild.state === "loading"
              ? { state: "loading" }
              : { state: "unavailable" };

      return {
        rootDirectory,
        sortKey: `0:${worker.workerName}:${worker.workerId}`,
        resource: {
          kind: "cloudflare_worker",
          id: worker.workerId,
          worker: {
            workerName: worker.workerName,
            build,
            destination: primary
              ? {
                  state: "available",
                  href: primary.href,
                  label: primary.label,
                  title,
                }
              : { state: "absent" },
            actions: destinations.slice(1).map((destination) => ({
              destination: "external",
              href: destination.href,
              label: destination.label,
            })),
          },
        },
      };
    },
  );
  const convexDeployments: VaultEnvironmentResourceInput[] =
    convexObservations.state === "loaded"
      ? vault.convexProjects.flatMap((project) => {
          const observation = convexObservations.observations.find(
            (candidate) => candidate.convexProjectId === project.convexProjectId,
          );
          const provider = observation?.provider;
          if (
            !provider ||
            provider.state !== "current" ||
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
                provenance: "production",
                region: deployment.region,
                title: `Open production Convex deployment ${deployment.deploymentName}`,
              },
            },
          ];
        })
      : [];
  const convexLoading =
    convexObservations.state === "loading" || convexObservations.state === "checking"
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

export function buildPullRequestEnvironmentRoots({
  resources,
}: {
  resources: PullRequestResources;
}): VaultEnvironmentRoot[] {
  const workers = resources.workers.map((worker) => {
    const rootDirectory = worker.rootDirectory;
    const destination =
      worker.cloudflareBranchPreview.state === "available"
        ? {
            state: "available" as const,
            href: worker.cloudflareBranchPreview.url,
            label: "Branch preview",
            title: new URL(worker.cloudflareBranchPreview.url).hostname,
          }
        : { state: "absent" as const };
    return {
      rootDirectory,
      sortKey: `0:${worker.workerName}:${worker.workerId}`,
      resource: {
        kind: "cloudflare_worker" as const,
        id: worker.workerId,
        worker: {
          workerName: worker.workerName,
          build:
            worker.cloudflareBuild.state === "available"
              ? {
                  state: "available" as const,
                  buildState: worker.cloudflareBuild.buildState,
                  logsUrl: worker.cloudflareBuild.logsUrl,
                }
              : worker.cloudflareBuild,
          destination,
          actions: [],
        },
      },
    };
  });
  const convexDeployments = resources.convexProjects.flatMap((project) => {
    if (project.state !== "branch") {
      return [];
    }
    return [
      {
        rootDirectory: project.rootDirectory,
        sortKey: `1:${project.deploymentName}:${project.convexProjectId}`,
        resource: {
          kind: "destination" as const,
          id: `convex:${project.convexProjectId}`,
          actions: [
            {
              destination: "external" as const,
              href: `${project.dashboardUrl}/data`,
              label: "Data",
            },
          ],
          href: project.dashboardUrl,
          label: project.deploymentName,
          provider: "convex" as const,
          provenance: "pull_request_branch" as const,
          title: `Open branch Convex deployment ${project.deploymentName}`,
        },
      },
    ];
  });

  return groupVaultEnvironmentResources([...workers, ...convexDeployments]);
}

export function buildPullRequestOtherPreviews({
  resources,
  settingsHref,
}: {
  resources: PullRequestResources;
  settingsHref: string;
}): VaultOtherPreview[] {
  const cloudflare = resources.hostingPreviews.cloudflare;
  const netlify = resources.hostingPreviews.netlify;
  return [
    ...(cloudflare.state === "available"
      ? cloudflare.previews.map((preview): VaultOtherPreview => ({
          id: `cloudflare:${preview.kind}:${preview.name}:${preview.url}`,
          destinationLabel: "Branch preview",
          href: preview.url,
          name: preview.name,
          provider: preview.kind === "worker" ? "cloudflare_worker" : "cloudflare_pages",
          setup:
            preview.kind === "worker"
              ? { state: "connect", href: settingsHref }
              : { state: "none" },
        }))
      : []),
    ...(netlify.state === "available"
      ? netlify.previews.map((preview): VaultOtherPreview => ({
          id: `netlify:${preview.name}:${preview.url}`,
          destinationLabel: "Deploy preview",
          href: preview.url,
          name: preview.name,
          provider: "netlify",
          setup: { state: "none" },
        }))
      : []),
  ].sort(
    (left, right) =>
      vaultOtherPreviewProviderOrder[left.provider] -
        vaultOtherPreviewProviderOrder[right.provider] ||
      left.name.localeCompare(right.name) ||
      left.href.localeCompare(right.href),
  );
}
