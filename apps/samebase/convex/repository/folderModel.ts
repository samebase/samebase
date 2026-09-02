import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, number, string } = v;

export const repositoryFolderTables = {
  /** Per-user shallow repository folders inside one organization. */
  ui_repositoryTree_folders: defineTable({
    userId: id("users"),
    organizationId: id("organizations"),
    name: string(),
    nameKey: string(),
    position: number(),
    collapsed: boolean(),
  })
    .index("by_userId_and_organizationId_and_nameKey", ["userId", "organizationId", "nameKey"])
    .index("by_userId_and_organizationId_and_position", ["userId", "organizationId", "position"])
    .index("by_organization", ["organizationId"]),

  /** One current or stale folder assignment for one user's repository. */
  ui_repositoryTree_folderAssignments: defineTable({
    userId: id("users"),
    organizationId: id("organizations"),
    repositoryId: id("repositories"),
    folderId: id("ui_repositoryTree_folders"),
  })
    .index("by_userId_and_organizationId_and_repositoryId", [
      "userId",
      "organizationId",
      "repositoryId",
    ])
    .index("by_organization", ["organizationId"])
    .index("by_repositoryId", ["repositoryId"]),
};
