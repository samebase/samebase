import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id } = v;

export const repositoryOrganizationTreeTables = {
  /** One user's saved organization disclosure choice in the repository tree. */
  ui_repositoryTree_organizationSettings: defineTable({
    userId: id("users"),
    organizationId: id("organizations"),
    collapsed: boolean(),
  })
    .index("by_userId_and_organizationId", ["userId", "organizationId"])
    .index("by_organization", ["organizationId"]),
};
