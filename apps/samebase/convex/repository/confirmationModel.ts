import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

import { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";

const { id, literal, number, object, optional, string, union } = v;

/**
The catalog ids of the actions that needed a confirmation (rfcs/125). Only the retry still does. Token
and audit rows hold the other three, so these tables keep accepting them.
*/
export const vConfirmedAction = union(
  literal("connect_cloudflare_worker"),
  literal("rotate_convex_deploy_keys"),
  literal(retryInfrastructureProvisioningContract.id),
  literal("detach_resource"),
);
export type ConfirmedAction = Infer<typeof vConfirmedAction>;

/** The surface that sent the confirmed call. An MCP call names its grant and OAuth client. */
export const vConfirmationSurface = union(
  object({ kind: literal("dashboard") }),
  object({ kind: literal("mcp"), grantId: string(), clientId: string() }),
);
export type ConfirmationSurface = Infer<typeof vConfirmationSurface>;

/**
The resource that a confirmed action changes, with its provider identity where one exists, so the
audit row stays readable after the attachment row is deleted.
*/
export const vConfirmedResource = union(
  object({ kind: literal("repository"), githubRepositoryFullName: string() }),
  object({
    kind: literal("cloudflare_worker"),
    accountId: string(),
    workerTag: string(),
    workerName: string(),
  }),
  object({
    kind: literal("convex_project"),
    teamId: string(),
    projectId: string(),
    codeLocation: string(),
  }),
);
export type ConfirmedResource = Infer<typeof vConfirmedResource>;

export const repositoryConfirmationTables = {
  /**
  Hashes of one-use tokens from the needs_confirmation result of a gated action, written by
  repository/confirmations.ts for the dashboard and MCP. Each token is bound to its user, the
  surface that received it (the dashboard, or one MCP grant and client), its action, and the
  SHA-256 digest of its normalized request, and stores the effect and the exact acknowledgement
  that the second call must send. A scheduled mutation deletes it at expiry.
  */
  actionConfirmationTokens: defineTable({
    tokenHash: string(),
    userId: id("users"),
    surface: vConfirmationSurface,
    action: vConfirmedAction,
    requestDigest: string(),
    effect: string(),
    acknowledgement: string(),
    createdAt: number(),
    expiresAt: number(),
    consumedAt: optional(number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_id", ["userId"]),

  /**
  One accepted confirmation of a gated action, written in the transaction that consumes its token,
  before the action runs. The action can still fail after it. Production behavior never reads it.
  */
  audit_confirmedActions_events: defineTable({
    userId: id("users"),
    organizationId: id("organizations"),
    repositoryId: id("repositories"),
    action: vConfirmedAction,
    resource: vConfirmedResource,
    requestDigest: string(),
    effect: string(),
    acknowledgement: string(),
    surface: vConfirmationSurface,
    issuedAt: number(),
    confirmedAt: number(),
  }).index("by_user_id", ["userId"]),
};
