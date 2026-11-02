import type { api } from "../../../convex/_generated/api";
import { groupResourcesByComponent, stackCards } from "../../../shared/alchemyState";
import type { ConvexDeploymentRegion } from "../../../shared/convexDeploymentRegions";
import {
  buildRepositoryComponentsRoute,
  buildRepositoryDatabaseRoute,
  buildRepositorySchemaRoute,
} from "@/lib/repositoryRoutes";
import type { RepositoryAlchemyStacks } from "./useRepositoryProviderObservations";

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
unlinked = a host that no URL reaches, such as the wildcard host `*.json.md` of a zone route.
*/
type RepositoryEnvironmentWorkerDestination =
  | { state: "available"; href: string; label: string; title: string }
  | { state: "unlinked"; label: string }
  | { state: "absent" };

export type RepositoryEnvironmentWorker = {
  workerName: string;
  destination: RepositoryEnvironmentWorkerDestination;
  actions: readonly RepositoryEnvironmentAction[];
};

export type RepositoryEnvironmentResource =
  | {
      kind: "destination";
      id: string;
      actions: readonly RepositoryEnvironmentLink[];
      href: string;
      label: string;
      provider: "convex";
      region?: ConvexDeploymentRegion;
      /**
      The installed components of a deployment of the Alchemy state store that own a Worker or an
      R2 bucket of its stage, in path order. Only the store records component bindings, and a
      deployment without such a component has no `components`.
      */
      components?: readonly RepositoryEnvironmentComponent[];
      title: string;
    }
  | {
      kind: "cloudflare_worker";
      /** `alchemy:<stack>:<fqn>`. */
      id: string;
      worker: RepositoryEnvironmentWorker;
    }
  | {
      kind: "cloudflare_r2_bucket";
      id: string;
      bucketName: string;
      href: string;
    }
  | {
      kind: "hub_client";
      id: string;
      status: "on" | "not set up" | "suspended";
    };

type RepositoryEnvironmentComponentResource = Extract<
  RepositoryEnvironmentResource,
  { kind: "cloudflare_worker" | "cloudflare_r2_bucket" }
>;

type RepositoryEnvironmentComponent = {
  path: string;
  resources: readonly RepositoryEnvironmentComponentResource[];
};

type RepositoryEnvironmentSortedResource<
  Resource extends RepositoryEnvironmentResource = RepositoryEnvironmentResource,
> = {
  resource: Resource;
  sortKey: string;
};

function compareRepositoryEnvironmentResourceInputs(
  left: RepositoryEnvironmentSortedResource,
  right: RepositoryEnvironmentSortedResource,
): number {
  return (
    left.sortKey.localeCompare(right.sortKey) || left.resource.id.localeCompare(right.resource.id)
  );
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

/**
prod = the stage of the default branch `branch`: a deployment row offers the Samebase routes of the
deployment. `headCommit` is the head of the default branch, null until the GitHub read gives it.

pr-<number> = the stage of a pull request with the head `headCommit`: a preview deployment row
offers no route.
*/
type RepositoryStackCardStage =
  | {
      name: "prod";
      headCommit: string | null;
      branch: string;
      owner: string;
      repoName: string;
      schemaGraphEnabled: boolean;
      repository: RepositoryDashboardRepository;
    }
  | { name: `pr-${number}`; headCommit: string };

/**
The stack cards of the default-branch block and of a pull request row, from the stacks of the
repository in the Alchemy state store: one card for each stack with the stage (`stackCards`), with
the resource rows of that stage. The store records no build, so no build state shows, and the run
line of a card names the deployed commit, so a row adds no note about it.

A Worker links to its custom domains and workers.dev URL, `attr.urls`, and without them to its zone
routes. A route shows its host, such as `e.samebase.com` for `e.samebase.com/*`, with the path when
the route covers only a path, such as `example.com/api/`, and links to that path. A route with a
wildcard host, such as `*.json.md/*`, has no URL and shows without a link. The first one is the
Worker's destination and the others are in its menu. The Worker whose URL is the address of the card
(`addressWorker`) leaves that URL out.

A production Convex deployment takes its dashboard link and region from the live reads of its
project and production deployment. A deployment without a live read, such as a preview
deployment, links to its dashboard by name. The Schema route reads schema
snapshots stored for an attachment row, so a deployment offers it only when its project is attached.

A Worker or an R2 bucket in a namespace that a deployment binds to an installed component
(`groupResourcesByComponent`) shows under that component, below that deployment. A component that
owns neither shows no row.
*/
export function buildAlchemyStackCards({
  stacks,
  stage,
}: {
  stacks: RepositoryAlchemyStacks;
  stage: RepositoryStackCardStage;
}) {
  return stackCards({
    stacks: stacks.stacks,
    liveDeployments: stacks.liveDeployments,
    stage: stage.name,
    headCommit: stage.headCommit,
  }).map((card) => {
    const { convexDeployments, hubClients, workers, r2Buckets } = card.resources;
    const workerInput = (
      worker: (typeof workers)[number],
    ): RepositoryEnvironmentSortedResource<RepositoryEnvironmentComponentResource> => {
      const { fqn, state } = worker;
      const { routes, urls, workerName } = state.attr;
      // The card title shows the address, so the row of its Worker keeps only the other URLs.
      const rowUrls =
        fqn === card.addressWorker ? urls.filter((url) => url !== card.address) : urls;
      const destinations: RepositoryEnvironmentAction[] =
        urls.length > 0
          ? rowUrls.map((url) => ({
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
        sortKey: `0:${workerName}:${card.stack}:${fqn}`,
        resource: {
          kind: "cloudflare_worker",
          id: `alchemy:${card.stack}:${fqn}`,
          worker: {
            workerName,
            destination: !primary
              ? { state: "absent" }
              : primary.destination === "none"
                ? { state: "unlinked", label: primary.label }
                : {
                    state: "available",
                    href: primary.href,
                    label: primary.label,
                    title: `Open ${workerName}`,
                  },
            actions: destinations.slice(1),
          },
        },
      };
    };
    const r2BucketInput = (
      bucket: (typeof r2Buckets)[number],
    ): RepositoryEnvironmentSortedResource<RepositoryEnvironmentComponentResource> => {
      const { fqn, state } = bucket;
      const { accountId, bucketName, jurisdiction } = state.attr;
      return {
        sortKey: `2:${bucketName}`,
        resource: {
          kind: "cloudflare_r2_bucket",
          id: `alchemy:${card.stack}:${fqn}`,
          bucketName,
          href: `https://dash.cloudflare.com/${encodeURIComponent(accountId)}/r2/${encodeURIComponent(jurisdiction)}/buckets/${encodeURIComponent(bucketName)}`,
        },
      };
    };
    const { components } = groupResourcesByComponent([
      ...convexDeployments,
      ...workers,
      ...r2Buckets,
    ]);
    const owned = new Set(components.flatMap(({ resources }) => resources));

    const rows = [
      ...workers.filter((worker) => !owned.has(worker)).map(workerInput),
      ...convexDeployments.map((deployment): RepositoryEnvironmentSortedResource => {
        const { fqn, state } = deployment;
        const { attr } = state;
        const live = stacks.liveDeployments.find(
          (candidate) => candidate.deploymentName === attr.name,
        );
        const href =
          live?.dashboardUrl ?? `https://dashboard.convex.dev/d/${encodeURIComponent(attr.name)}`;
        const region = live?.region;
        const attachedProject =
          stage.name === "prod"
            ? stage.repository.convexProjects.find(
                (candidate) => candidate.projectId === String(attr.projectId),
              )
            : undefined;
        const deploymentComponents = components.flatMap((component) => {
          if (component.deployment !== deployment) {
            return [];
          }
          const resources = [
            ...workers.filter((worker) => component.resources.includes(worker)).map(workerInput),
            ...r2Buckets
              .filter((bucket) => component.resources.includes(bucket))
              .map(r2BucketInput),
          ]
            .sort(compareRepositoryEnvironmentResourceInputs)
            .map((input) => input.resource);
          return resources.length === 0 ? [] : [{ path: component.path, resources }];
        });
        return {
          sortKey: `1:${attr.name}:${card.stack}:${fqn}`,
          resource: {
            kind: "destination",
            id: `alchemy:${card.stack}:${fqn}`,
            actions:
              stage.name === "prod"
                ? buildConvexProductionActions({
                    branch: stage.branch,
                    convexProjectId: attachedProject?.convexProjectId ?? String(attr.projectId),
                    deploymentName: attr.name,
                    owner: stage.owner,
                    repoName: stage.repoName,
                    schemaGraphEnabled: stage.schemaGraphEnabled && attachedProject !== undefined,
                  })
                : [],
            href,
            label: attr.name,
            provider: "convex",
            ...(region ? { region } : {}),
            ...(deploymentComponents.length > 0 ? { components: deploymentComponents } : {}),
            title: `Open Convex deployment ${attr.name}`,
          },
        };
      }),
      ...r2Buckets.filter((bucket) => !owned.has(bucket)).map(r2BucketInput),
      ...hubClients.map(({ fqn, state }): RepositoryEnvironmentSortedResource => {
        const { status } = state.attr;
        return {
          sortKey: `3:${fqn}`,
          resource: {
            kind: "hub_client",
            id: `alchemy:${card.stack}:${fqn}`,
            status: status === "off" ? "not set up" : status,
          },
        };
      }),
    ];

    return {
      ...card,
      address:
        card.address === null
          ? null
          : { href: card.address, label: buildProductionUrlLabel(card.address) },
      resources: rows.sort(compareRepositoryEnvironmentResourceInputs).map((row) => row.resource),
    };
  });
}

export type RepositoryStackCard = ReturnType<typeof buildAlchemyStackCards>[number];
