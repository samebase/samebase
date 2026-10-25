import { isRecord } from "@samebase/dependent/main";
import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import type { AlchemyStateObservation } from "./alchemyStateModel";
import { REPOSITORY_ROOT_DIRECTORY } from "./repositoryRootDirectory";

const { array, literal, number, object, optional, string, union } = v;

/**
Alchemy's `encodeState` writes a `Redacted` value in clear text as `{ "__redacted__": <value> }`, and
its `reviveState` reads every object with this key as a secret.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.80/packages/alchemy/src/State/StateEncoding.ts#L87-L91
@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.80/packages/alchemy/src/State/StateEncoding.ts#L138-L140
*/
export const ALCHEMY_REDACTED_MARKER = "__redacted__";

/**
A binding that `bindComponent` writes on a `Convex.Deployment` row: the installed component `path`
from the app's `convex.config.ts`, such as `mail` or `workspace/mail`, owns the resources of the
Alchemy `namespace` in the same stack and stage. `namespace` lists the namespace ids from the stack
root, such as `["Mail/Shared", "Inbox"]`, and `[]` is the stack root.

@see https://github.com/samebase/alchemy-convex/blob/v0.10.0/src/Component.ts#L22-L54
*/
const vAlchemyConvexComponentBinding = object({
  data: object({ type: literal("component"), path: string(), namespace: array(string()) }),
});

/**
The state of a `Convex.Deployment` resource. `props.project` holds every attribute of the project
when the stack passes a `Convex.Project` resource, and only `projectId` otherwise (measured).
`props.rootDir` is the app directory relative to the directory of the stack file, "." included.
`props.source` is the Convex functions directory relative to `rootDir`, as a path or as an object
with `path`; a deployment without `source` pushes nothing. `attr.url` is the client URL, such as
`https://happy-animal-123.convex.cloud`, and `attr.siteUrl` the HTTP actions URL. Alchemy writes
`bindings` on every row, and a `Convex.Deployment` takes only component bindings.

@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/Deployment.ts#L86-L120
@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/Deployment.ts#L178-L194
@see https://github.com/samebase/alchemy-convex/blob/v0.10.0/src/Deployment.ts#L145-L151
@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Apply.ts#L521-L547
*/
export const vAlchemyConvexDeploymentState = object({
  resourceType: literal("Convex.Deployment"),
  props: object({
    project: object({ projectId: number(), slug: optional(string()), teamId: optional(number()) }),
    rootDir: string(),
    source: optional(union(string(), object({ path: string() }))),
  }),
  attr: object({ projectId: number(), name: string(), url: string(), siteUrl: string() }),
  bindings: array(vAlchemyConvexComponentBinding),
});

/**
The state of a `Convex.Project` resource.

@see https://github.com/samebase/alchemy-convex/blob/v0.7.0/src/Project.ts#L57-L64
*/
export const vAlchemyConvexProjectState = object({
  resourceType: literal("Convex.Project"),
  attr: object({ projectId: number(), slug: string(), teamId: number() }),
});

/**
The state of a `Cloudflare.Worker` resource. `attr.url` is the most significant URL of the Worker:
its custom domain, else an alias, else its workers.dev URL. A Worker that no URL reaches has none.
`attr.urls` lists every URL that serves the Worker, `attr.url` first, and no zone route.
`attr.routes` lists the zone routes, such as `e.samebase.com/*`: the `url` of a route is the origin
of its host, and a route with a wildcard host, such as `*.json.md/*`, has none.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Cloudflare/Workers/Worker.ts#L1149-L1198
@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Cloudflare/Workers/RoutePattern.ts#L88-L95
*/
export const vAlchemyCloudflareWorkerState = object({
  resourceType: literal("Cloudflare.Worker"),
  attr: object({
    workerName: string(),
    url: optional(string()),
    urls: array(string()),
    routes: array(object({ pattern: string(), url: optional(string()) })),
  }),
});

/**
The state of a `Cloudflare.R2.Bucket` resource. These attributes identify the bucket in Cloudflare.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Cloudflare/R2/Bucket.ts#L263-L280
*/
export const vAlchemyCloudflareR2BucketState = object({
  resourceType: literal("Cloudflare.R2.Bucket"),
  attr: object({ bucketName: string(), accountId: string(), jurisdiction: string() }),
});

/**
The path from the repository root of `paths` joined below the directory of the stack file, such as
`apps/x/convex` for `apps/x/alchemy.run.ts` with `.` and `./convex`, or `.` for the root. Null for an
absolute path or a path outside the repository.
*/
export function stackPath(stackFile: string, ...paths: readonly string[]): string | null {
  if (paths.some((path) => path.startsWith("/"))) {
    return null;
  }
  const parts: string[] = [];
  for (const part of [
    ...stackFile.split("/").slice(0, -1),
    ...paths.flatMap((path) => path.split("/")),
  ]) {
    if (part === "..") {
      if (parts.pop() === undefined) {
        return null;
      }
    } else if (part !== "" && part !== ".") {
      parts.push(part);
    }
  }
  return parts.length === 0 ? "." : parts.join("/");
}

/**
The deployed resources of one stage of a stack, by type. `stackFile` is the stack file of the
stage's run record. The code location of a Convex deployment is its `source` below `props.rootDir`
below the directory of the stack file, and null without `source`. A row that no validator accepts,
such as one without `attr` from an interrupted deploy, and a deployment whose `rootDir` leaves the
repository are left out.
*/
export function stageResources(stage: {
  stackFile: string;
  resources: readonly { fqn: string; value: string }[];
}) {
  const { stackFile } = stage;
  const states = stage.resources.map((resource) => {
    const state: unknown = JSON.parse(resource.value);
    return { fqn: resource.fqn, state };
  });

  return {
    convexDeployments: states.flatMap(({ fqn, state }) => {
      if (!validate(vAlchemyConvexDeploymentState, state, { allowUnknownFields: true })) {
        return [];
      }
      const { rootDir, source } = state.props;
      const sourcePath = typeof source === "string" ? source : source?.path;
      return stackPath(stackFile, rootDir) === null
        ? []
        : [
            {
              fqn,
              state,
              codeLocation:
                sourcePath === undefined ? null : stackPath(stackFile, rootDir, sourcePath),
            },
          ];
    }),
    workers: states.flatMap(({ fqn, state }) =>
      validate(vAlchemyCloudflareWorkerState, state, { allowUnknownFields: true })
        ? [{ fqn, state }]
        : [],
    ),
    r2Buckets: states.flatMap(({ fqn, state }) =>
      validate(vAlchemyCloudflareR2BucketState, state, { allowUnknownFields: true })
        ? [{ fqn, state }]
        : [],
    ),
  };
}

/**
The stacks of a repository as the overview shows them at the stage `stage`, such as `prod` for the
default branch or `pr-12` for pull request 12: one card for each stack with that stage, in stack
file order. `framed` is true when the repository has more than one stack: the overview frames each
card to tell the stacks apart, and shows the only stack of a repository without a frame. `folder`
is the directory of the stack file, `/` for the root, and null when the repository has one stack
and its stack file is at the root, on every stage. A stack file outside the repository has no card.

`run` is the run line of the card: the last completed deploy of the stage, `deployedHeadCommit`,
with `recordedAt` and `runUrl` of its run record. The overview shows `headCommit` above the cards,
the head of the default branch or of the pull request, so a stage that deployed that commit has no
run line. A stage without a completed deploy, or a `headCommit` that is not known yet (null), also
has none. The run record and GitHub both give full commit hashes.

`address` is where the stack serves: the first Convex deployment by fqn at its `convexSite` custom
domain with the fewest labels, such as samebase.com before api.samebase.com (the oldest on a tie),
else at its `siteUrl`, which a failed read of the custom domains also gives. Only the
production deployments have a live read, so a preview deployment serves at its `siteUrl`. A stack
without a Convex deployment serves at the URL of its first Worker that has one, `addressWorker` (its
fqn), and a stack with neither has no address. The row of `addressWorker` in the card does not
repeat the address.
*/
export function stackCards({
  stacks,
  liveDeployments,
  stage: stageName,
  headCommit,
}: Pick<Extract<AlchemyStateObservation, { store: "found" }>, "stacks" | "liveDeployments"> & {
  stage: string;
  headCommit: string | null;
}) {
  const cards = stacks
    .flatMap((stack) => {
      const stage = stack.stages.find((candidate) => candidate.name === stageName);
      const directory = stage ? stackPath(stage.record.stackFile) : null;
      if (!stage || directory === null) {
        return [];
      }

      const { record } = stage;
      const resources = stageResources({
        stackFile: record.stackFile,
        resources: stage.resources,
      });
      // The store gives the rows of a stage in fqn order.
      const deployment = resources.convexDeployments.at(0);
      const siteDomain = deployment
        ? liveDeployments
            .find((live) => live.deploymentName === deployment.state.attr.name)
            ?.customDomains.filter((domain) => domain.requestDestination === "convexSite")
            .sort((left, right) => left.domain.split(".").length - right.domain.split(".").length)
            .at(0)
        : undefined;
      const addressWorker = deployment
        ? undefined
        : resources.workers.find(({ state }) => state.attr.url);
      const { deployedHeadCommit } = stage;
      return [
        {
          stack: stack.name,
          stackFile: record.stackFile,
          folder: directory === "." ? REPOSITORY_ROOT_DIRECTORY : directory,
          run:
            !headCommit || !deployedHeadCommit || deployedHeadCommit === headCommit
              ? null
              : { deployedHeadCommit, recordedAt: record.recordedAt, runUrl: record.runUrl },
          address: !deployment
            ? (addressWorker?.state.attr.url ?? null)
            : siteDomain
              ? `https://${siteDomain.domain}`
              : deployment.state.attr.siteUrl,
          addressWorker: addressWorker?.fqn ?? null,
          resources,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.stackFile.localeCompare(right.stackFile) || left.stack.localeCompare(right.stack),
    );

  return cards.map((card) => ({
    ...card,
    framed: stacks.length > 1,
    folder: stacks.length === 1 && card.folder === REPOSITORY_ROOT_DIRECTORY ? null : card.folder,
  }));
}

/**
The namespace ids of a state row from the stack root. Alchemy writes the namespace of a row as a
chain from the innermost id, such as `{ "Id": "Inbox", "Parent": { "Id": "Mail/Shared" } }` for
`["Mail/Shared", "Inbox"]`, and a row at the stack root has no `namespace`.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Namespace.ts#L5-L8
@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/State/ResourceState.ts#L36-L37
*/
function namespaceOf(node: unknown): string[] {
  return isRecord(node) && typeof node["Id"] === "string"
    ? [...namespaceOf(node["Parent"]), node["Id"]]
    : [];
}

/**
The resources of a stage under the installed Convex components that own them, by the `bindings` of
the `Convex.Deployment` rows of the stage. A resource belongs to the component of the longest bound
namespace that its row's `namespace` starts with, so a child namespace bound to another component
takes precedence. The fqn does not decide: a slash in a logical id or in a namespace id, such as
`Mail/Shared`, is not a namespace boundary. A component is installed in one deployment, so
`deployment` is the row whose binding names it. `others` are the resources outside every bound
namespace. Components are in path order, then in the order of their first resource, and each list
keeps the order of `resources`.
*/
export function groupResourcesByComponent<Resource extends { state: unknown }>(
  resources: readonly Resource[],
) {
  const bindings = resources
    .flatMap((deployment) =>
      validate(vAlchemyConvexDeploymentState, deployment.state, { allowUnknownFields: true })
        ? deployment.state.bindings.map(({ data }) => ({ deployment, ...data }))
        : [],
    )
    .sort((left, right) => right.namespace.length - left.namespace.length);
  const others: Resource[] = [];
  const components: { path: string; deployment: Resource; resources: Resource[] }[] = [];

  for (const resource of resources) {
    const namespace = namespaceOf(isRecord(resource.state) ? resource.state["namespace"] : null);
    const owner = bindings.find((binding) =>
      binding.namespace.every((id, index) => namespace[index] === id),
    );
    if (owner === undefined) {
      others.push(resource);
      continue;
    }
    const component = components.find(
      ({ deployment, path }) => deployment === owner.deployment && path === owner.path,
    );
    if (component === undefined) {
      components.push({ path: owner.path, deployment: owner.deployment, resources: [resource] });
    } else {
      component.resources.push(resource);
    }
  }

  return {
    others,
    components: components.sort((left, right) => left.path.localeCompare(right.path)),
  };
}
