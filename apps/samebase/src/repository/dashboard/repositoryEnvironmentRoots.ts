import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PullRequestResources,
  PullRequestWorkerResource,
} from "../../../convex/repository/pullRequestModel";
import { getConvexCodeRootDirectory } from "../../../shared/convexCodeLocation";
import type { ConvexDeploymentRegion } from "../../../shared/convexDeploymentRegions";
import {
  buildRepositoryComponentsRoute,
  buildRepositoryDatabaseRoute,
  buildRepositorySchemaRoute,
} from "@/lib/repositoryRoutes";
import type {
  RepositoryCloudflareProviderObservationState,
  RepositoryCloudflareWorkerBuildsObservation,
  RepositoryConvexProjectObservation,
  RepositoryProviderObservationState,
} from "./useRepositoryProviderObservations";

type RepositoryDashboardRepository = NonNullable<
  (typeof api.repository.list)["_returnType"]
>[number];

export type RepositoryEnvironmentAction =
  | { destination: "external"; href: string; label: string }
  | { destination: "samebase"; href: string; label: string };

type RepositoryEnvironmentWorkerDestination =
  | {
      state: "available";
      href: string;
      label: string;
      provenance: "production" | "selected_result" | "earlier_check";
      title: string;
    }
  | { state: "absent" };

export type RepositoryEnvironmentWorker = {
  workerName: string;
  build:
    | { state: "available"; buildState: RepositoryEnvironmentBuildState; logsUrl: string }
    | { state: "absent" }
    | { state: "loading" }
    | { state: "unavailable" };
  destination: RepositoryEnvironmentWorkerDestination;
  actions: readonly RepositoryEnvironmentAction[];
};

type RepositoryEnvironmentBuildState = Extract<
  PullRequestWorkerResource["cloudflareBuild"],
  { state: "available" }
>["buildState"];

type RepositoryProductionBuildState = Extract<
  Extract<RepositoryCloudflareWorkerBuildsObservation, { state: "available" }>["productionBuild"],
  { state: "available" }
>["buildState"];

export type RepositoryEnvironmentResource =
  | {
      kind: "destination";
      id: string;
      actions: readonly RepositoryEnvironmentAction[];
      href: string;
      label: string;
      provider: "convex";
      provenance: "production" | "pull_request_branch";
      region?: ConvexDeploymentRegion;
      title: string;
    }
  | {
      kind: "convex_loading";
      id: Id<"repositoryConvexProjects">;
    }
  | {
      kind: "cloudflare_worker";
      id: Id<"repositoryCloudflareWorkers">;
      worker: RepositoryEnvironmentWorker;
    };

export type RepositoryEnvironmentRoot = {
  rootDirectory: string;
  resources: readonly RepositoryEnvironmentResource[];
};

export type RepositoryOtherPreview = {
  id: string;
  destinationLabel: "Branch preview" | "Deploy preview";
  href: string;
  name: string;
  provider: "cloudflare_pages" | "cloudflare_worker" | "netlify";
  setup: { state: "connect"; href: string } | { state: "none" };
};

const repositoryOtherPreviewProviderOrder = {
  cloudflare_worker: 0,
  cloudflare_pages: 1,
  netlify: 2,
} as const;

type RepositoryEnvironmentResourceInput = {
  resource: RepositoryEnvironmentResource;
  rootDirectory: string;
  sortKey: string;
};

function groupRepositoryEnvironmentResources(
  inputs: readonly RepositoryEnvironmentResourceInput[],
): RepositoryEnvironmentRoot[] {
  const inputsByRoot = new Map<string, RepositoryEnvironmentResourceInput[]>();

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
  repository,
}: {
  branch: string;
  cloudflareObservations: RepositoryCloudflareProviderObservationState;
  convexObservations: RepositoryProviderObservationState<RepositoryConvexProjectObservation>;
  owner: string;
  repoName: string;
  schemaGraphEnabled: boolean;
  repository: RepositoryDashboardRepository;
}): RepositoryEnvironmentRoot[] {
  const workerObservations = cloudflareObservations.workers;
  const buildsObservations = cloudflareObservations.builds;
  const cloudflareWorkers: RepositoryEnvironmentResourceInput[] = repository.cloudflareWorkers.map(
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
        buildsObservation?.state === "available"
          ? buildsObservation.productionBuild
          : buildsObservations.state === "loading" || buildsObservations.state === "checking"
            ? ({ state: "loading" } as const)
            : ({ state: "unavailable" } as const);
      const build:
        | { state: "available"; buildState: RepositoryProductionBuildState; logsUrl: string }
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
                  provenance: "production",
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
  const convexDeployments: RepositoryEnvironmentResourceInput[] =
    convexObservations.state === "loaded"
      ? repository.convexProjects.flatMap((project) => {
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
                    href: buildRepositoryDatabaseRoute({
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
                          href: buildRepositorySchemaRoute({
                            owner,
                            repoName,
                            branch,
                            convexProjectId: project.convexProjectId,
                          }),
                          label: "Schema",
                        },
                      ]
                    : []),
                  {
                    destination: "samebase",
                    href: buildRepositoryComponentsRoute({
                      owner,
                      repoName,
                      deploymentName: deployment.deploymentName,
                    }),
                    label: "Components",
                  },
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
      ? repository.convexProjects.map((project) => ({
          rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
          sortKey: `1:${project.convexProjectId}`,
          resource: {
            kind: "convex_loading" as const,
            id: project.convexProjectId,
          },
        }))
      : [];

  return groupRepositoryEnvironmentResources([
    ...cloudflareWorkers,
    ...convexDeployments,
    ...convexLoading,
  ]);
}

export function buildPullRequestEnvironmentRoots({
  resources,
}: {
  resources: PullRequestResources;
}): RepositoryEnvironmentRoot[] {
  const workers = resources.workers.map((worker) => {
    const rootDirectory = worker.rootDirectory;
    const destination =
      worker.cloudflareBranchPreview.state === "available"
        ? {
            state: "available" as const,
            href: worker.cloudflareBranchPreview.url,
            label: "Branch preview",
            provenance: worker.cloudflareBranchPreview.provenance,
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

  return groupRepositoryEnvironmentResources([...workers, ...convexDeployments]);
}

export function buildPullRequestOtherPreviews({
  resources,
  settingsHref,
}: {
  resources: PullRequestResources;
  settingsHref: string;
}): RepositoryOtherPreview[] {
  const cloudflare = resources.hostingPreviews.cloudflare;
  const netlify = resources.hostingPreviews.netlify;
  return [
    ...(cloudflare.state === "available"
      ? cloudflare.previews.map((preview): RepositoryOtherPreview => ({
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
      ? netlify.previews.map((preview): RepositoryOtherPreview => ({
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
      repositoryOtherPreviewProviderOrder[left.provider] -
        repositoryOtherPreviewProviderOrder[right.provider] ||
      left.name.localeCompare(right.name) ||
      left.href.localeCompare(right.href),
  );
}
