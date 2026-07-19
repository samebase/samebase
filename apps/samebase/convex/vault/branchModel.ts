import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vVaultBranchCommitChecksSummary } from "../commitCheckModel";
import { vGithubTreeData } from "./model";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

export const vPullRequestLabel = union(
  string(),
  object({
    name: string(),
    color: optional(string()),
  }),
);
export type PullRequestLabel = Infer<typeof vPullRequestLabel>;

export const vVaultBranchCommitSummary = object({
  sha: string(),
  title: optional(string()),
  authoredAt: optional(number()),
  checks: optional(vVaultBranchCommitChecksSummary),
});
export type VaultBranchCommitSummary = Infer<typeof vVaultBranchCommitSummary>;

export const vaultBranchTables = {
  /** Remote Git branches mirrored from GitHub for a vault repository. */
  observations_vaultRepository_branches: defineTable({
    vaultId: id("vaults"),
    name: string(),
    headCommitSha: string(),
    lastCommitAt: optional(number()),
    aheadBy: optional(number()),
    behindBy: optional(number()),
    pullRequestUrl: optional(string()),
    pullRequestNumber: optional(number()),
    pullRequestLabels: optional(array(vPullRequestLabel)),
    pullRequestTitle: optional(string()),
    pullRequestIsDraft: optional(boolean()),
    isDefault: boolean(),
    isProtected: boolean(),
    remoteState: union(literal("active"), literal("deleted_upstream")),
    defaultRank: number(),
    stateRank: number(),
    commitRank: number(),
    deletedUpstreamAt: optional(number()),
    lastSyncedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_name", ["vaultId", "name"])
    .index("by_vault_and_remote_state", ["vaultId", "remoteState"])
    .index("by_vault_and_defaultRank_and_stateRank_and_commitRank_and_name", [
      "vaultId",
      "defaultRank",
      "stateRank",
      "commitRank",
      "name",
    ]),

  /** Branch-scoped Git trees for each vault. */
  observations_vaultRepository_branchTrees: defineTable({
    vaultId: id("vaults"),
    branch: string(),
    treeSHA: string(),
    commitSHA: optional(string()),
    treeData: vGithubTreeData,
    lastTreeRefreshAt: number(),
    treeRefreshStartedAt: optional(number()),
  }).index("by_vault_and_branch", ["vaultId", "branch"]),
};
