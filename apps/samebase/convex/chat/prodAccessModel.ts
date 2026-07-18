import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, optional, string, union } = v;

export const vProdAccessScope = union(literal("vault"), literal("global"));

export const vProdAccessProvider = union(literal("convex"), literal("cloudflare"));

export const vProdAccessResourceKind = union(
  literal("deployment_status"),
  literal("logs"),
  literal("data_query"),
  literal("project_inventory"),
  literal("account_inventory"),
  literal("workers_inventory"),
);

export const vProdAccessStatus = union(
  literal("proposed"),
  literal("approved"),
  literal("rejected"),
  literal("executed"),
  literal("failed"),
  literal("expired"),
);

export const vProdAccessRedactionLevel = union(
  literal("default"),
  literal("strict"),
  literal("raw_fallback"),
);

export const vProdAccessAuditAction = union(
  literal("proposed"),
  literal("approved"),
  literal("rejected"),
  literal("executed"),
  literal("failed"),
  literal("expired"),
);

export const prodAccessTables = {
  /** Approval-first requests for AI reads against production data or infrastructure. */
  operations_aiProdAccessRequests: defineTable({
    threadId: string(),
    requesterUserId: id("users"),
    vaultId: optional(id("vaults")),
    scope: vProdAccessScope,
    provider: vProdAccessProvider,
    resourceKind: vProdAccessResourceKind,
    toolName: string(),
    paramsJson: string(),
    status: vProdAccessStatus,
    redactionLevel: vProdAccessRedactionLevel,
    approvedBy: optional(id("users")),
    approvedAt: optional(number()),
    executedAt: optional(number()),
    expiresAt: optional(number()),
    error: optional(string()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_requester", ["requesterUserId"])
    .index("by_approved_by", ["approvedBy"])
    .index("by_status", ["status"])
    .index("by_vault", ["vaultId"]),

  /** Immutable audit events for the production-access request lifecycle. */
  audit_aiProdAccessEvents: defineTable({
    requestId: id("operations_aiProdAccessRequests"),
    actorUserId: id("users"),
    action: vProdAccessAuditAction,
    toolName: string(),
    endpoint: string(),
    argumentHash: string(),
    rowCount: optional(number()),
    logLineCount: optional(number()),
    createdAt: number(),
    error: optional(string()),
  })
    .index("by_request", ["requestId"])
    .index("by_actor", ["actorUserId"])
    .index("by_action", ["action"]),
};
