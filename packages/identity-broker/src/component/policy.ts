import { v, type Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { tenantRow } from "./apps";
import { vDeploymentType } from "./schema";

// The host's policy (RFC 137) runs in its HTTP actions, on facts that these rows hold. The facts go
// up as `vRegistration`; the decision comes back down as `vPolicyDecision`, with the owner the
// policy saw, so a mutation refuses a decision that the rows no longer support.

const { array, boolean, literal, object, optional, string, union } = v;

/** The facts of a client that the host's policy decides on, from the client's and the tenant's rows. */
export const vRegistration = object({
  /** GitHub's numeric id of the repository, from the tenant `gh-<id>`. */
  repositoryId: string(),
  /** `owner/name` at registration. */
  repository: string(),
  /** The tenant's recorded owner. */
  ownerId: string(),
  app: string(),
  deploymentType: vDeploymentType,
  redirectUri: string(),
  proof: union(literal("github-actions"), literal("initial-access-token")),
});

/**
 * What the host decided for one request. `ownerId` is the tenant owner the policy decided on;
 * absent for a host without hub mode, which has no policy and is its own. `connectors` and
 * `resources` are the ones the client may use now: the enrollment intersected with the policy's,
 * and the policy's resources as the grants and requests name them (the provider's resource URL).
 */
export const vPolicyDecision = object({
  ownerId: optional(string()),
  paused: boolean(),
  connectors: array(string()),
  resources: array(string()),
});
export type PolicyDecision = Infer<typeof vPolicyDecision>;

/**
 * The facts of `client`, or null for a client that a host registered outside `/hub-clients`: a
 * tenant that is not a repository's, or one with no recorded owner. A hub refuses such a client; a
 * broker without hub mode has no policy to feed.
 */
export async function registrationOf(ctx: QueryCtx, client: Doc<"clients">, app: Doc<"apps">) {
  const repositoryId = /^gh-([1-9][0-9]*)$/.exec(app.tenantId)?.[1];
  const tenant = await tenantRow(ctx, app.tenantId);
  if (repositoryId === undefined || tenant?.ownerId === undefined) {
    return null;
  }
  return {
    repositoryId,
    repository: client.registeredBy.githubRepository,
    ownerId: tenant.ownerId,
    app: client.app,
    deploymentType: client.deploymentType,
    redirectUri: client.redirectUri,
    proof:
      client.registeredBy.kind === "github"
        ? ("github-actions" as const)
        : ("initial-access-token" as const),
  };
}

/**
 * Why a decision does not apply to the client: `stale` when the tenant's owner is no longer the one
 * the policy decided on, `paused` when the policy paused the client. Null when it applies.
 */
export async function refusalOf(
  ctx: QueryCtx,
  decision: PolicyDecision,
  tenantId: string,
): Promise<"stale" | "paused" | null> {
  if (
    decision.ownerId !== undefined &&
    (await tenantRow(ctx, tenantId))?.ownerId !== decision.ownerId
  ) {
    return "stale";
  }
  return decision.paused ? "paused" : null;
}

/**
 * The connectors a request may use now: its set and the client's enrollment, of those the
 * decision's policy gives or the admin granted the client's app (`granted`, read by the caller in
 * the transaction that decides, so a revoked grant stops the next step).
 */
export function usableConnectors(
  request: { connectors: string[] },
  client: { connectors: string[] },
  decision: PolicyDecision,
  granted: string[],
): string[] {
  return request.connectors.filter(
    (name) =>
      client.connectors.includes(name) &&
      (decision.connectors.includes(name) || granted.includes(name)),
  );
}
