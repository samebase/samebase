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
  One row for each client that `POST /api/hub-clients` registered. A client is one deployment of a
  user's app at the identity hub: an ID, a secret, and the one address the hub sends people back to.
  The row keeps what GitHub's token said about the run that asked, so a client can be traced to a
  repository and a person. Keyed on GitHub's numeric ids, so a row outlives a repository that leaves
  Samebase. It holds no secret.
  */
  hubClientRegistrations: defineTable({
    /**
    The ID that the hub gave the client, such as `cl_3f9a...`. The deployment sends it as
    `HUB_CLIENT_ID` when someone signs in, and the hub's own row for the client has the same ID.
    */
    clientId: string(),
    /**
    GitHub's numeric ID of the repository, the token's `repository_id`. GitHub's GraphQL API calls
    it `databaseId`, as opposed to the node ID. It never changes on a rename or a transfer. The
    hub's tenant of the repository is `gh-<this ID>`, and `repositories` has the same field.
    */
    githubRepositoryDatabaseId: string(),
    /** GitHub's numeric ID of the user or organization that owns the repository, as `organizations.githubOwnerId`. */
    githubOwnerId: string(),
    /** `owner/name` at the time of the run. A rename changes it, so look a repository up by its ID. */
    githubRepository: string(),
    /**
    The GitHub account that started the run: who pushed to main, opened or updated the pull request,
    or started the workflow by hand. Not always the owner.
    */
    githubActorId: string(),
    /** Its login at the time of the run. */
    githubActorLogin: string(),
    /** The commit that the run deployed. For a pull request, GitHub's merge commit of it, not its head. */
    commitSha: string(),
    /** `prod` for a run of main, or `pr-<number>` for a pull request, from the token's event and ref. */
    stage: string(),
    /**
    The name that the app's stack gives itself at the hub: `HUB_APP` in the template's
    `alchemy.run.ts`, which is `app`. One repository can hold several apps with different names.
    The hub derives the app's user IDs from the repository ID and this name, so a new name means new
    users.
    */
    app: string(),
    /**
    The address where the hub sends people back after Google, with a one-time code, such as
    `https://happy-otter-123.convex.site/auth/hub/callback`. The hub accepts only this exact address
    for this client. Its origin served `/samebase-verification.json` with this repository's ID when
    the client was registered.
    */
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
