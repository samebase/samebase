import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, number, string } = v;

export const agentTables = {
  /**
   * Short-lived markers held while agent or chat actions may still write.
   * Account deletion waits for every marker to be released or expire.
   */
  agentActionLeases: defineTable({
    userId: id("users"),
    expiresAt: number(),
  }).index("by_user_and_expires_at", ["userId", "expiresAt"]),

  /** Per-user, per-vault node dimensions for Graph View. */
  ui_agentGraphNode_layouts: defineTable({
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
