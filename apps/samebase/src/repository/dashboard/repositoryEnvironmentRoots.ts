import { validate } from "convex-helpers/validators";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PullRequestResources,
  PullRequestWorkerResource,
} from "../../../convex/repository/pullRequestModel";
import { buildConvexDeploymentDashboardUrl } from "../../../convex/repository/providerDashboardUrls";
import {
  convexFunctionsDirectory,
  vAlchemyCloudflareWorkerState,
  vAlchemyConvexDeploymentState,
  vAlchemyConvexProjectState,
} from "../../../shared/alchemyState";
import { getConvexCodeRootDirectory } from "../../../shared/convexCodeLocation";
import type { ConvexDeploymentRegion } from "../../../shared/convexDeploymentRegions";
import {
  buildRepositoryComponentsRoute,
  buildRepositoryDatabaseRoute,
  buildRepositorySchemaRoute,
} from "@/lib/repositoryRoutes";
import type {
  RepositoryAlchemyStack,
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

/**
unrecorded = the Worker comes from the Alchemy state store, which records no build.
*/
export type RepositoryEnvironmentWorker = {
  workerName: string;
  build:
    | { state: "available"; buildState: RepositoryEnvironmentBuildState; logsUrl: string }
    | { state: "absent" }
    | { state: "loading" }
    | { state: "unavailable" }
    | { state: "unrecorded" };
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
      /** The attachment id, or `alchemy:<fqn>` for a Worker of the Alchemy state store. */
      id: string;
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

/** The Samebase routes of the production deployment of an attached Convex project. */
function buildConvexProductionActions({
  branch,
  convexProjectId,
  deploymentName,
  owner,
  repoName,
  schemaGraphEnabled,
}: {
  branch: string;
  convexProjectId: Id<"repositoryConvexProjects">;
  deploymentName: string;
  owner: string;
  repoName: string;
  schemaGraphEnabled: boolean;
}): RepositoryEnvironmentAction[] {
  return [
    {
      destination: "samebase",
      href: buildRepositoryDatabaseRoute({ owner, repoName, branch, convexProjectId }),
      label: "Data",
    },
    ...(schemaGraphEnabled
      ? [
          {
            destination: "samebase" as const,
            href: buildRepositorySchemaRoute({ owner, repoName, branch, convexProjectId }),
            label: "Schema",
          },
        ]
      : []),
    {
      destination: "samebase",
      href: buildRepositoryComponentsRoute({ owner, repoName, deploymentName }),
      label: "Components",
    },
  ];
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
                actions: buildConvexProductionActions({
                  branch,
                  convexProjectId: project.convexProjectId,
                  deploymentName: deployment.deploymentName,
                  owner,
                  repoName,
                  schemaGraphEnabled,
                }),
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

/** The directory that holds `path`, `/` for the repository root. */
function parentDirectory(path: string): string {
  const parts = path.split("/").slice(0, -1);
  return parts.length === 0 ? "/" : parts.join("/");
}

/**
The default-branch block from the stack of the repository in the Alchemy state store: its stage
`prod`, or `main` for a stack whose stages are not renamed yet. The store records no build and no
region, so neither shows. A Convex deployment links to its dashboard when the store names its
project slug and the team of the organization, and offers the Samebase routes only when its project
is attached, since those routes read the attachment.
*/
export function buildAlchemyEnvironmentRoots({
  branch,
  owner,
  repoName,
  schemaGraphEnabled,
  repository,
  stack,
}: {
  branch: string;
  owner: string;
  repoName: string;
  schemaGraphEnabled: boolean;
  repository: RepositoryDashboardRepository;
  stack: RepositoryAlchemyStack;
}): RepositoryEnvironmentRoot[] {
  const stage =
    stack.stages.find((candidate) => candidate.name === "prod") ??
    stack.stages.find((candidate) => candidate.name === "main");
  if (!stage) {
    return [];
  }

  const stackFile = stage.run.state === "recorded" ? stage.run.record.stackFile : null;
  // Without a run record the stack file is unknown, so its resources sit at the repository root.
  const stackDirectory = stackFile === null ? "/" : parentDirectory(stackFile);
  const states = stage.resources.map((resource) => {
    const state: unknown = JSON.parse(resource.value);
    return { fqn: resource.fqn, state };
  });
  const projects = states.flatMap(({ state }) =>
    validate(vAlchemyConvexProjectState, state, { allowUnknownFields: true }) ? [state.attr] : [],
  );

  const workers = states.flatMap(({ fqn, state }): RepositoryEnvironmentResourceInput[] => {
    if (!validate(vAlchemyCloudflareWorkerState, state, { allowUnknownFields: true })) {
      return [];
    }
    const { url, urls, workerName } = state.attr;
    return [
      {
        rootDirectory: stackDirectory,
        sortKey: `0:${workerName}:${fqn}`,
        resource: {
          kind: "cloudflare_worker",
          id: `alchemy:${fqn}`,
          worker: {
            workerName,
            build: { state: "unrecorded" },
            destination:
              url === undefined
                ? { state: "absent" }
                : {
                    state: "available",
                    href: url,
                    label: buildProductionUrlLabel(url),
                    provenance: "production",
                    title:
                      stackDirectory === "/"
                        ? "Open production app"
                        : `Open production app for ${stackDirectory}`,
                  },
            actions: urls
              .filter((other) => other !== url)
              .map((other) => ({
                destination: "external",
                href: other,
                label: buildProductionUrlLabel(other),
              })),
          },
        },
      },
    ];
  });
  const convexDeployments = states.flatMap(
    ({ fqn, state }): RepositoryEnvironmentResourceInput[] => {
      if (!validate(vAlchemyConvexDeploymentState, state, { allowUnknownFields: true })) {
        return [];
      }
      const { attr, props } = state;
      const project =
        projects.find((candidate) => candidate.projectId === attr.projectId) ?? props.project;
      const dashboardUrl =
        stack.convexTeam.teamSlug !== null &&
        project.slug !== undefined &&
        String(project.teamId) === stack.convexTeam.teamId
          ? buildConvexDeploymentDashboardUrl({
              teamSlug: stack.convexTeam.teamSlug,
              projectSlug: project.slug,
              deploymentName: attr.name,
            })
          : null;
      const href = dashboardUrl ?? attr.siteUrl;
      const source = props.source;
      const sourcePath = typeof source === "string" ? source : source?.path;
      const codeLocation =
        stackFile === null || sourcePath === undefined
          ? null
          : convexFunctionsDirectory(stackFile, sourcePath);
      const attachedProject = repository.convexProjects.find(
        (candidate) => candidate.projectId === String(attr.projectId),
      );
      return [
        {
          rootDirectory: codeLocation === null ? stackDirectory : parentDirectory(codeLocation),
          sortKey: `1:${attr.name}:${fqn}`,
          resource: {
            kind: "destination",
            id: `alchemy:${fqn}`,
            actions: [
              ...(attachedProject
                ? buildConvexProductionActions({
                    branch,
                    convexProjectId: attachedProject.convexProjectId,
                    deploymentName: attr.name,
                    owner,
                    repoName,
                    schemaGraphEnabled,
                  })
                : []),
              ...[attr.siteUrl, attr.url]
                .filter((destination) => destination !== href)
                .map((destination) => ({
                  destination: "external" as const,
                  href: destination,
                  label: buildProductionUrlLabel(destination),
                })),
            ],
            href,
            label: attr.name,
            provider: "convex",
            provenance: "production",
            title: `Open production Convex deployment ${attr.name}`,
          },
        },
      ];
    },
  );

  return groupRepositoryEnvironmentResources([...workers, ...convexDeployments]);
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
  const alchemyPreview = resources.alchemyPreview;
  const alchemyWorkers =
    alchemyPreview.state === "available"
      ? alchemyPreview.workers.map((worker) => ({
          rootDirectory: "/",
          sortKey: `0:${worker.name}:alchemy`,
          resource: {
            kind: "cloudflare_worker" as const,
            id: `alchemy:${worker.name}`,
            worker: {
              workerName: worker.name,
              build: { state: "unrecorded" as const },
              // A stage may be from an earlier commit than the head of the pull request.
              destination:
                worker.url === null
                  ? { state: "absent" as const }
                  : {
                      state: "available" as const,
                      href: worker.url,
                      label: "Branch preview",
                      provenance: "earlier_check" as const,
                      title: buildProductionUrlLabel(worker.url),
                    },
              actions: [],
            },
          },
        }))
      : [];
  const alchemyDeployments =
    alchemyPreview.state === "available"
      ? alchemyPreview.convexDeployments.map((deployment) => ({
          // The stack is keyed by the repository, so its preview sits at the repository root.
          rootDirectory: "/",
          sortKey: `1:${deployment.name}:alchemy`,
          resource: {
            kind: "destination" as const,
            id: `alchemy:${deployment.name}`,
            actions: [],
            // The stage output names the preview; a stage without one links the deployment.
            href: alchemyPreview.url ?? deployment.url,
            label: deployment.name,
            provider: "convex" as const,
            provenance: "pull_request_branch" as const,
            title: `Open the preview of Convex deployment ${deployment.name}`,
          },
        }))
      : [];

  return groupRepositoryEnvironmentResources([
    ...workers,
    ...convexDeployments,
    ...alchemyWorkers,
    ...alchemyDeployments,
  ]);
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
