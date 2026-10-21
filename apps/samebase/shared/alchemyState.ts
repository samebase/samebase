import { v } from "convex/values";

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
`props.source` is the Convex functions directory from the directory of the stack file, as a path or
as an object with `path`; a deployment without `source` pushes nothing. `attr.url` is the client
URL, such as `https://happy-animal-123.convex.cloud`, and `attr.siteUrl` the HTTP actions URL.

@see https://github.com/samebase/alchemy-convex/blob/v0.7.0/src/Deployment.ts#L78-L128
*/
export const vAlchemyConvexDeploymentState = object({
  resourceType: literal("Convex.Deployment"),
  props: object({
    project: object({ projectId: number(), slug: optional(string()), teamId: optional(number()) }),
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
The Convex functions directory from the repository root: the directory of the stack file joined
with `source`, such as `convex` for `alchemy.run.ts` and `./convex`, `apps/x/convex` for
`apps/x/alchemy.run.ts`, or `.` for the root. Null for a `source` outside the repository.
*/
export function convexFunctionsDirectory(stackFile: string, source: string): string | null {
  if (source.startsWith("/")) {
    return null;
  }
  const parts: string[] = [];
  for (const part of [...stackFile.split("/").slice(0, -1), ...source.split("/")]) {
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
