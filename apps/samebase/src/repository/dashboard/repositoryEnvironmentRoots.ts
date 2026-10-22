import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PullRequestResources,
  PullRequestWorkerResource,
} from "../../../convex/repository/pullRequestModel";
import { placeStageResources } from "../../../shared/alchemyState";
import { getConvexCodeRootDirectory } from "../../../shared/convexCodeLocation";
import type { ConvexDeploymentRegion } from "../../../shared/convexDeploymentRegions";
import {
  buildRepositoryComponentsRoute,
  buildRepositoryDatabaseRoute,
  buildRepositorySchemaRoute,
} from "@/lib/repositoryRoutes";
import type {
  RepositoryAlchemyStacks,
  RepositoryCloudflareProviderObservationState,
  RepositoryCloudflareWorkerBuildsObservation,
  RepositoryConvexProjectObservation,
  RepositoryProviderObservationState,
} from "./useRepositoryProviderObservations";

type RepositoryDashboardRepository = NonNullable<
  (typeof api.repository.list)["_returnType"]
>[number];

type RepositoryEnvironmentLink =
  | { destination: "external"; href: string; label: string }
  | { destination: "samebase"; href: string; label: string };

/**
none = a host that no URL reaches, such as the wildcard host `*.xml.md` of a zone route.
*/
export type RepositoryEnvironmentAction =
  | RepositoryEnvironmentLink
  | { destination: "none"; label: string };

/**
pull_request_head = a preview of the Alchemy state store whose run record names the head commit of
the pull request, `headCommit`.
*/
type RepositoryEnvironmentPullRequestHead = { provenance: "pull_request_head"; headCommit: string };

/**
unlinked = a host that no URL reaches, such as the wildcard host `*.json.md` of a zone route.
*/
type RepositoryEnvironmentWorkerDestination =
  | ({ state: "available"; href: string; label: string; title: string } & (
      | { provenance: "production" | "selected_result" | "earlier_check" }
      | RepositoryEnvironmentPullRequestHead
    ))
  | { state: "unlinked"; label: string }
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
  | ({
      kind: "destination";
      id: string;
      actions: readonly RepositoryEnvironmentLink[];
      href: string;
      label: string;
      provider: "convex";
      region?: ConvexDeploymentRegion;
      title: string;
    } & (
      | { provenance: "production" | "pull_request_branch" }
      | RepositoryEnvironmentPullRequestHead
    ))
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

/**
The Samebase routes of a production Convex deployment. `convexProjectId` is the attachment id, or
the Convex project id of a deployment of the repository stack, which the Data route resolves
through the Alchemy state store.
*/
function buildConvexProductionActions({
  branch,
  convexProjectId,
  deploymentName,
  owner,
  repoName,
  schemaGraphEnabled,
}: {
  branch: string;
  convexProjectId: string;
  deploymentName: string;
  owner: string;
  repoName: string;
  schemaGraphEnabled: boolean;
}): RepositoryEnvironmentLink[] {
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

/**
The default-branch block from the stacks of the repository in the Alchemy state store: the stage
`prod` of each stack, each resource in its directory of the repository (`placeStageResources`). The
store records no build, so no build state shows.

A Worker links to its custom domains and workers.dev URL, `attr.urls`, and without them to its zone
routes. A route shows its host, such as `e.samebase.com` for `e.samebase.com/*`, with the path when
the route covers only a path, such as `example.com/api/`, and links to that path. A route with a
wildcard host, such as `*.json.md/*`, has no URL and shows without a link. The first one is the
Worker's destination and the others are in its menu.

A Convex deployment takes its dashboard link and region from the live reads of its project and
production deployment, like an attached project. The Schema route reads schema snapshots stored for
an attachment row, so a deployment offers it only when its project is attached.
*/
export function buildAlchemyEnvironmentRoots({
  branch,
  owner,
  repoName,
  schemaGraphEnabled,
  repository,
  stacks,
}: {
  branch: string;
  owner: string;
  repoName: string;
  schemaGraphEnabled: boolean;
  repository: RepositoryDashboardRepository;
  stacks: RepositoryAlchemyStacks;
}): RepositoryEnvironmentRoot[] {
  return groupRepositoryEnvironmentResources(
    stacks.stacks.flatMap((stack): RepositoryEnvironmentResourceInput[] => {
      const stage = stack.stages.find((candidate) => candidate.name === "prod");
      if (!stage) {
        return [];
      }
      const { convexDeployments, workers } = placeStageResources({
        stackFile: stage.record.stackFile,
        resources: stage.resources,
      });

      return [
        ...workers.map(({ fqn, state, rootDirectory }): RepositoryEnvironmentResourceInput => {
          const { routes, urls, workerName } = state.attr;
          const destinations: RepositoryEnvironmentAction[] =
            urls.length > 0
              ? urls.map((url) => ({
                  destination: "external",
                  href: url,
                  label: buildProductionUrlLabel(url),
                }))
              : routes.map((route) => {
                  // The pattern without its scheme and its last `*`, such as `e.samebase.com/` or
                  // `example.com/api/`: the route reaches the Worker only on that path of the host.
                  const target = route.pattern.replace(/^https?:\/\//i, "").replace(/\*$/, "");
                  const host = target.replace(/\/.*$/, "");
                  const path = target.slice(host.length);
                  const label = path === "/" ? host : target;
                  return route.url === undefined
                    ? { destination: "none", label }
                    : { destination: "external", href: `${route.url}${path}`, label };
                });
          const primary = destinations.at(0);
          return {
            rootDirectory,
            sortKey: `0:${workerName}:${stack.name}:${fqn}`,
            resource: {
              kind: "cloudflare_worker",
              id: `alchemy:${stack.name}:${fqn}`,
              worker: {
                workerName,
                build: { state: "unrecorded" },
                destination: !primary
                  ? { state: "absent" }
                  : primary.destination === "none"
                    ? { state: "unlinked", label: primary.label }
                    : {
                        state: "available",
                        href: primary.href,
                        label: primary.label,
                        provenance: "production",
                        title:
                          rootDirectory === "/"
                            ? "Open production app"
                            : `Open production app for ${rootDirectory}`,
                      },
                actions: destinations.slice(1),
              },
            },
          };
        }),
        ...convexDeployments.map(
          ({ fqn, state, rootDirectory }): RepositoryEnvironmentResourceInput => {
            const { attr } = state;
            const live = stacks.liveDeployments.find(
              (candidate) => candidate.deploymentName === attr.name,
            );
            // The deployment links to its site only when the live project read failed.
            const href = live?.dashboardUrl ?? attr.siteUrl;
            const region = live?.region;
            const attachedProject = repository.convexProjects.find(
              (candidate) => candidate.projectId === String(attr.projectId),
            );
            return {
              rootDirectory,
              sortKey: `1:${attr.name}:${stack.name}:${fqn}`,
              resource: {
                kind: "destination",
                id: `alchemy:${stack.name}:${fqn}`,
                actions: buildConvexProductionActions({
                  branch,
                  convexProjectId: attachedProject?.convexProjectId ?? String(attr.projectId),
                  deploymentName: attr.name,
                  owner,
                  repoName,
                  schemaGraphEnabled: schemaGraphEnabled && attachedProject !== undefined,
                }),
                href,
                label: attr.name,
                provider: "convex",
                provenance: "production",
                ...(region ? { region } : {}),
                title: `Open production Convex deployment ${attr.name}`,
              },
            };
          },
        ),
      ];
    }),
  );
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
  // A stage whose run record names the head of the pull request is current; any other stage may
  // be from an earlier commit.
  const alchemyPreview = resources.alchemyPreview;
  const alchemyWorkers =
    alchemyPreview.state === "available"
      ? alchemyPreview.workers.map((worker) => ({
          rootDirectory: worker.rootDirectory,
          sortKey: `0:${worker.name}:alchemy`,
          resource: {
            kind: "cloudflare_worker" as const,
            id: `alchemy:${worker.name}`,
            worker: {
              workerName: worker.name,
              build: { state: "unrecorded" as const },
              destination:
                worker.url === null
                  ? { state: "absent" as const }
                  : {
                      state: "available" as const,
                      href: worker.url,
                      label: "Branch preview",
                      title: buildProductionUrlLabel(worker.url),
                      ...(worker.headCommit === null
                        ? { provenance: "earlier_check" as const }
                        : {
                            provenance: "pull_request_head" as const,
                            headCommit: worker.headCommit,
                          }),
                    },
              actions: [],
            },
          },
        }))
      : [];
  const alchemyDeployments =
    alchemyPreview.state === "available"
      ? alchemyPreview.convexDeployments.map((deployment) => ({
          rootDirectory: deployment.rootDirectory,
          sortKey: `1:${deployment.name}:alchemy`,
          resource: {
            kind: "destination" as const,
            id: `alchemy:${deployment.name}`,
            actions: [],
            href: deployment.href,
            label: deployment.name,
            provider: "convex" as const,
            title: `Open the preview of Convex deployment ${deployment.name}`,
            ...(deployment.headCommit === null
              ? { provenance: "pull_request_branch" as const }
              : { provenance: "pull_request_head" as const, headCommit: deployment.headCommit }),
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
