import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vGithubTreeData } from "./model";

const { id, number, optional, string } = v;

export const vaultBranchTables = {
  /** Branch-scoped Git trees for each vault. */
  observations_vaultRepository_branchTrees: defineTable({
    vaultId: id("vaults"),
    branch: string(),
    treeSHA: string(),
    commitSHA: optional(string()),
    treeData: vGithubTreeData,
    lastTreeRefreshAt: number(),
  }).index("by_vault_and_branch", ["vaultId", "branch"]),
};
