import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const { literal, number, string, union } = v;

/** What a block stops: one GitHub repository, or every repository of one GitHub owner. */
export const vBlockKind = union(literal("repository"), literal("owner"));

export default defineSchema({
  /**
   * One row for each client that `POST /hub-clients` created, written in the mutation that creates
   * the client, and each row that samebase.com's `hubClientRegistrations` held before. The row keeps
   * what GitHub's token said about the run that asked, so a client can be traced to a repository and
   * a person. It holds no secret. Rows are never deleted: a preview client's row outlives the client.
   */
  registrations: defineTable({
    /** The client's id at the broker, such as `cl_3f9a...`, which the app sends as `HUB_CLIENT_ID`. */
    clientId: string(),
    /**
     * GitHub's numeric id of the repository, the token's `repository_id`. It never changes on a
     * rename or a transfer. The broker's tenant of the repository is `gh-<this id>`.
     */
    githubRepositoryDatabaseId: string(),
    /** GitHub's numeric id of the user or organization that owned the repository at the run. */
    githubOwnerId: string(),
    /** `owner/name` at the time of the run. A rename changes it, so look a repository up by its id. */
    githubRepository: string(),
    /** The GitHub account that started the run. Not always the owner. */
    githubActorId: string(),
    /** Its login at the time of the run. */
    githubActorLogin: string(),
    /** The commit that the run deployed. For a pull request, GitHub's merge commit of it. */
    commitSha: string(),
    /** `prod` for a run of main, or `pr-<number>` for a pull request, from the token. */
    stage: string(),
    /** The name that the app's stack gives itself, at most 64 characters. */
    app: string(),
    /**
     * The one address where the broker sends people back with a code. Its origin served
     * `/samebase-verification.json` with this repository's id when the client was registered.
     */
    redirectUri: string(),
    /** When the client was registered. An imported row keeps the time of samebase.com's row. */
    registeredAt: number(),
  })
    .index("by_client_id", ["clientId"])
    .index("by_github_repository_database_id", ["githubRepositoryDatabaseId"])
    .index("by_github_owner_id", ["githubOwnerId"])
    .index("by_registered_at", ["registeredAt"]),

  /**
   * The blocks that an admin set on samebase.com's admin page, one row per blocked repository or
   * owner. A repository block also disconnects the broker's tenant `gh-<id>`; an owner block also sets
   * the broker's owner switch. `POST /hub-clients` reads them before it fetches the verification file
   * and again when it creates the client. Unblocking deletes the row.
   */
  blocks: defineTable({
    kind: vBlockKind,
    /** The repository's or the owner's numeric GitHub id. */
    githubId: string(),
    reason: string(),
    /** The email of the samebase.com admin who set it. */
    adminEmail: string(),
  }).index("by_kind_and_github_id", ["kind", "githubId"]),

  /**
   * One row for each block and each unblock, appended and never changed or deleted. The admin page
   * lists them; nothing reads them to decide a request.
   */
  audit_block_events: defineTable({
    action: union(literal("block"), literal("unblock")),
    kind: vBlockKind,
    githubId: string(),
    reason: string(),
    adminEmail: string(),
  }),

  /**
   * The requests of `POST /hub-clients` in one fixed hourly window that starts at `startedAt`: one row
   * per repository, one per owner, and one for the owners that had no registration yet. Only admitted
   * requests count.
   */
  rateLimits: defineTable({
    scope: union(literal("repository"), literal("owner"), literal("new_owners")),
    /** The repository or owner id. Empty for `new_owners`, the one window of all new owners. */
    githubId: string(),
    startedAt: number(),
    count: number(),
    /**
     * For an owner: the start of the new-owners window that counted it, so an owner is counted once
     * in each such window whatever its own window does. Null otherwise.
     */
    newOwnersWindowStartedAt: union(number(), v.null()),
  }).index("by_scope_and_github_id", ["scope", "githubId"]),
});
