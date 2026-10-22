import { validate } from "convex-helpers/validators";
import { v, type Infer } from "convex/values";
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
The state of a `Convex.Deployment` resource. `props.project` holds every attribute of the project
when the stack passes a `Convex.Project` resource, and only `projectId` otherwise (measured).
`props.rootDir` is the app directory relative to the directory of the stack file, "." included; a
row written before @samebase/alchemy-convex 0.8.0 has none. `props.source` is the Convex functions
directory relative to `rootDir`, as a path or as an object with `path`; a deployment without
`source` pushes nothing. `attr.url` is the client URL, such as
`https://happy-animal-123.convex.cloud`, and `attr.siteUrl` the HTTP actions URL.

@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/Deployment.ts#L86-L120
*/
export const vAlchemyConvexDeploymentState = object({
  resourceType: literal("Convex.Deployment"),
  props: object({
    project: object({ projectId: number(), slug: optional(string()), teamId: optional(number()) }),
    rootDir: optional(string()),
    source: optional(union(string(), object({ path: string() }))),
  }),
  attr: object({ projectId: number(), name: string(), url: string(), siteUrl: string() }),
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
`attr.urls` lists every URL that serves the Worker, `attr.url` first.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Cloudflare/Workers/Worker.ts#L1149-L1175
*/
export const vAlchemyCloudflareWorkerState = object({
  resourceType: literal("Cloudflare.Worker"),
  attr: object({ workerName: string(), url: optional(string()), urls: array(string()) }),
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

/** A repository path as the overview names a root directory: `/` for the root. */
function rootDirectoryOf(path: string): string {
  return path === "." ? REPOSITORY_ROOT_DIRECTORY : path;
}

/**
The deployed resources of one stage of a stack, each with the directory of the repository that it
belongs to (`/` for the root). `stackFile` is the stack file of the stage's run record, or null for a
stage without one, whose resources sit at the repository root.

A Convex deployment sits in its app directory, `props.rootDir` below the directory of the stack
file, and in that directory for a row without `rootDir` or with one outside the repository. Its code
location adds `source`, and is null without a run record or a `source`. Alchemy's
`Cloudflare.Worker` has no `rootDir`, and its `main` and assets are relative to the directory where
the stack runs, so a Worker sits in the directory of the stack file. A row without `attr`, such as
one of an interrupted deploy, matches no validator and is left out.
*/
export function placeStageResources(stage: {
  stackFile: string | null;
  resources: readonly { fqn: string; value: string }[];
}): {
  convexDeployments: {
    fqn: string;
    state: Infer<typeof vAlchemyConvexDeploymentState>;
    rootDirectory: string;
    codeLocation: string | null;
  }[];
  workers: {
    fqn: string;
    state: Infer<typeof vAlchemyCloudflareWorkerState>;
    rootDirectory: string;
  }[];
} {
  const { stackFile } = stage;
  const stackDirectory = stackFile === null ? "." : (stackPath(stackFile) ?? ".");
  const states = stage.resources.map((resource) => {
    const state: unknown = JSON.parse(resource.value);
    return { fqn: resource.fqn, state };
  });

  return {
    convexDeployments: states.flatMap(({ fqn, state }) => {
      if (!validate(vAlchemyConvexDeploymentState, state, { allowUnknownFields: true })) {
        return [];
      }
      const rootDir = state.props.rootDir ?? ".";
      const source = state.props.source;
      const sourcePath = typeof source === "string" ? source : source?.path;
      return [
        {
          fqn,
          state,
          rootDirectory: rootDirectoryOf(
            (stackFile === null ? null : stackPath(stackFile, rootDir)) ?? stackDirectory,
          ),
          codeLocation:
            stackFile === null || sourcePath === undefined
              ? null
              : stackPath(stackFile, rootDir, sourcePath),
        },
      ];
    }),
    workers: states.flatMap(({ fqn, state }) =>
      validate(vAlchemyCloudflareWorkerState, state, { allowUnknownFields: true })
        ? [{ fqn, state, rootDirectory: rootDirectoryOf(stackDirectory) }]
        : [],
    ),
  };
}

/**
The stage that holds the production resources of a stack: `prod`, the upstream Alchemy name, or
`main` for a stack whose stages are not renamed yet.
*/
export function findProductionStage<Stage extends { name: string }>(
  stages: readonly Stage[],
): Stage | undefined {
  return (
    stages.find((stage) => stage.name === "prod") ?? stages.find((stage) => stage.name === "main")
  );
}
