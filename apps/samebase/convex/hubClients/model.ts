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
  One row for each client that `POST /api/hub-clients` registered: the hub's client ID, what GitHub's
  token said about the run that asked, and the return address that the host's file proved. Keyed on
  GitHub's numeric ids, so a row outlives a repository that leaves Samebase. It holds no secret.
  */
  hubClientRegistrations: defineTable({
    clientId: string(),
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    /** `owner/name` at the time of the run. */
    githubRepository: string(),
    /** The account that started the run. */
    githubActorId: string(),
    /** Its login at the time of the run. */
    githubActorLogin: string(),
    commitSha: string(),
    /** `prod` or `pr-<number>`, from the token's event and ref. */
    stage: string(),
    app: string(),
    redirectUri: string(),
  }).index("by_github_repository_database_id", ["githubRepositoryDatabaseId"]),

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
