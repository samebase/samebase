import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, number, optional, string } = v;

export const agentTables = {
  /**
   * Short-lived markers held while agent or chat actions may still write.
   * Account deletion waits for every marker to be released or expire.
   */
  operations_agentActionLeases: defineTable({
    userId: id("users"),
    expiresAt: number(),
  }).index("by_user_and_expires_at", ["userId", "expiresAt"]),

  /**
   * Hashes of one-use tokens that an authorized MCP client sends to a browser
   * to start a Samebase session for the grant's user.
   */
  operations_mcpBrowserLoginTokens: defineTable({
    tokenHash: string(),
    userId: id("users"),
    grantId: string(),
    clientId: string(),
    // Deprecated rollout field. New tokens never write it; legacy rows expire after five minutes.
    returnToPath: optional(string()),
    createdAt: number(),
    expiresAt: number(),
    consumedAt: optional(number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_id", ["userId"])
    .index("by_grant_id", ["grantId"]),

  /** Per-user, per-vault node dimensions for Graph View. */
  ui_agentGraphNodeLayout: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    nodeId: string(),
    width: number(),
    height: number(),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_user_vault_and_node", ["userId", "vaultId", "nodeId"]),
};
