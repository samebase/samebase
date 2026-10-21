import { v } from "convex/values";

const { literal, number, object, optional, string, union } = v;

/**
Alchemy's `encodeState` writes a `Redacted` value in clear text as `{ "__redacted__": <value> }`, and
its `reviveState` reads every object with this key as a secret.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.80/packages/alchemy/src/State/StateEncoding.ts#L87-L91
@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.80/packages/alchemy/src/State/StateEncoding.ts#L138-L140
*/
export const ALCHEMY_REDACTED_MARKER = "__redacted__";

/**
The state of a `Convex.Deployment` resource. `props.source` is the Convex functions directory from
the directory of the stack file, as a path or as an object with `path`; a deployment without
`source` pushes nothing. `attr.url` is the client URL, such as `https://happy-animal-123.convex.cloud`.

@see https://github.com/samebase/alchemy-convex/blob/v0.7.0/src/Deployment.ts#L78-L128
*/
export const vAlchemyConvexDeploymentState = object({
  resourceType: literal("Convex.Deployment"),
  props: object({ source: optional(union(string(), object({ path: string() }))) }),
  attr: object({ projectId: number(), name: string(), url: string() }),
});

/**
The state of a `Cloudflare.Worker` resource. `attr.url` is the most significant URL of the Worker:
its custom domain, else an alias, else its workers.dev URL. A Worker that no URL reaches has none.

@see https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.83/packages/alchemy/src/Cloudflare/Workers/Worker.ts#L1149-L1166
*/
export const vAlchemyCloudflareWorkerState = object({
  resourceType: literal("Cloudflare.Worker"),
  attr: object({ workerName: string(), url: optional(string()) }),
});
