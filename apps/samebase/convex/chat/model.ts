import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, optional, string, union } = v;

export const chatTables = {
  /** Per-thread context not modeled by the Agent component. */
  agentThreadContext: defineTable({
    threadId: string(),
    userId: id("users"),
    vaultId: optional(id("vaults")),
    repositoryFullName: optional(string()),
    branch: optional(string()),
    filePath: optional(string()),
    systemPrompt: optional(string()),
    draftMessage: optional(string()),
    draftUpdatedAt: optional(number()),
    createdAt: number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_userId", ["userId"])
    .index("by_vault", ["vaultId"])
    .index("by_userId_and_vaultId", ["userId", "vaultId"]),

  /** Commit proposals, production-read proposals, results, and tool activity. */
  chatMessageMetadata: defineTable({
    messageId: string(),
    threadId: string(),
    type: union(
      literal("tool_activity"),
      literal("commit_proposal"),
      literal("prod_read_proposal"),
      literal("prod_read_result"),
    ),
    payloadJson: string(),
    createdAt: number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_threadId", ["threadId"]),
};
