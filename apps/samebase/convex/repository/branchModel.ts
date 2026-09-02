import { defineTable } from "convex/server";
import { v } from "convex/values";

import { vGitHubTreeData } from "./model";

const { id, number, string } = v;

export const repositoryBranchTables = {
  /** Exact Git tree cache for one repository branch at one observed commit. */
  observations_repository_branchTrees: defineTable({
    repositoryId: id("repositories"),
    branch: string(),
    commitSHA: string(),
    treeData: vGitHubTreeData,
    lastTreeRefreshAt: number(),
  }).index("by_repository_and_branch", ["repositoryId", "branch"]),
};
