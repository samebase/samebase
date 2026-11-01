import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, object, union } = v;

export const hubClientTables = {
  /**
  The requests of `POST /api/hub-clients` in one fixed window, which starts when the row is created.
  Each repository and each organization has one row. Only that endpoint reads and writes the count.
  */
  hubClientRateLimits: defineTable(
    union(
      object({
        scope: literal("repository"),
        repositoryId: id("repositories"),
        count: number(),
      }),
      object({
        scope: literal("organization"),
        organizationId: id("organizations"),
        count: number(),
      }),
    ),
  )
    .index("by_repository", ["repositoryId"])
    .index("by_organization", ["organizationId"]),
};
