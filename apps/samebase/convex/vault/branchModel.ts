import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vGithubTreeData } from "./model";

const { id, number, string } = v;

export const vaultBranchTables = {
  /** Exact Git tree cache for one vault branch at one observed commit. */
  observations_vaultRepository_branchTrees: defineTable({
    vaultId: id("vaults"),
    branch: string(),
    commitSHA: string(),
    treeData: vGithubTreeData,
    lastTreeRefreshAt: number(),
  }).index("by_vault_and_branch", ["vaultId", "branch"]),
};
