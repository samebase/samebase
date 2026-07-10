import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, literal, number, optional, string, union } = v;

export const retainedCodespaceStates = [
  "creating",
  "starting",
  "running",
  "stopping",
  "stopped",
  "deleting",
  "failed",
] as const;

export const vCodespaceState = union(
  ...retainedCodespaceStates.map((state) => literal(state)),
  literal("deleted"),
);

/**
 * GitHub Codespaces for AI execution environments.
 * Each vault can have multiple codespaces over time, but only one active.
 */
export const codespacesTable = defineTable({
  vaultId: id("vaults"),
  userId: id("users"),

  ghCodespaceId: string(),
  ghCodespaceName: string(),

  state: vCodespaceState,

  webUrl: optional(string()),

  agentUrl: optional(string()),
  agentToken: optional(string()),
  agentHealthy: optional(boolean()),
  portsVisibilityEnsured: optional(boolean()),
  portsVisibilityEnsuredAt: optional(number()),
  portsVisibilityLastError: optional(string()),

  createdAt: number(),
  lastStartedAt: optional(number()),
  lastStoppedAt: optional(number()),
  deletedAt: optional(number()),
  lastHealthCheckAt: optional(number()),

  commitSha: string(),
  branch: string(),
})
  .index("by_vault", ["vaultId"])
  .index("by_vault_and_state", ["vaultId", "state"])
  .index("by_user", ["userId"])
  .index("by_user_and_vault_and_state", ["userId", "vaultId", "state"])
  .index("by_gh_id", ["ghCodespaceId"])
  .index("by_state", ["state"]);
