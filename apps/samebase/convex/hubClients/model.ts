import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, object, string, union } = v;

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

  /**
  How many times a GitHub repository connected to or left Samebase. The hub orders these changes by
  this count, so a request that stalled cannot overwrite a newer one. A clock could not do this, as
  its values do not follow commit order. The row outlives the repository, which is why the count is
  not on the repository row: a counter that restarts would make the next change look old.
  */
  hubClientConnectionRevisions: defineTable({
    githubRepositoryDatabaseId: string(),
    revision: number(),
  }).index("by_github_repository_database_id", ["githubRepositoryDatabaseId"]),
};
