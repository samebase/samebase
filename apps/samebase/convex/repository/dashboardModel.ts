import { defineTable } from "convex/server";
import { v } from "convex/values";

const { array, boolean, id, number, string } = v;

export const repositoryDashboardTables = {
  /** Per-user choices that control which pull requests appear for one repository. */
  ui_repositoryPullRequests_filters: defineTable({
    userId: id("users"),
    repositoryId: id("repositories"),
    hiddenLabels: array(string()),
    includeDrafts: boolean(),
    includeNoLabel: boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_repository", ["userId", "repositoryId"])
    .index("by_repository", ["repositoryId"]),

  /** One user's saved resource-links disclosure choice for one repository. */
  ui_repositoryResourceLinks_settings: defineTable({
    userId: id("users"),
    updatedAt: number(),
    resourceLinksOpen: boolean(),
    repositoryId: id("repositories"),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_repository", ["userId", "repositoryId"])
    .index("by_repository", ["repositoryId"]),
};
