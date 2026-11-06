import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vRefreshGrant, vResourceRequest } from "./resourceSchema.js";

const { boolean, literal, number, object, optional, string, union } = v;

/** How a client authenticates at the token endpoint. Public clients are not supported yet. */
export const vTokenEndpointAuthMethod = union(
  literal("client_secret_post"),
  literal("client_secret_basic"),
);

/** The deployment a client stands for. */
export const vDeploymentType = union(
  literal("production"),
  literal("development"),
  literal("preview"),
);

/**
 * Who made a client at `POST /hub-clients`, as of that registration: the owner is the one of that
 * moment, so a transfer of the repository later changes nothing here. `github`: a GitHub Actions run,
 * with what GitHub's OIDC token said about it. `initial_access_token`: a laptop with the app's token,
 * with the repository and owner of the token's production run.
 */
export const vRegisteredBy = union(
  object({
    kind: literal("github"),
    /** `owner/name` at the time of the run. A rename changes it, so look a repository up by its id. */
    githubRepository: string(),
    githubOwnerId: string(),
    /** The GitHub account that started the run. Not always the owner. */
    githubActorId: string(),
    githubActorLogin: string(),
    /** The commit that the run deployed. For a pull request, GitHub's merge commit of it. */
    commitSha: string(),
  }),
  object({
    kind: literal("initial_access_token"),
    githubRepository: string(),
    githubOwnerId: string(),
    /** When the token was issued, which tells one token of the app from the next. */
    issuedAt: number(),
  }),
);

/** What a block stops: one GitHub repository, or every repository of one GitHub owner. */
export const vBlockKind = union(literal("repository"), literal("owner"));

/** The windows of `POST /hub-clients`. `new_owners` is the one window of all owners new to the hub. */
export const vRateLimitScope = union(
  literal("repository"),
  literal("owner"),
  literal("new_owners"),
);

/**
 * What a connector attested about the user. `upstreamId` is the connector's own stable id for the
 * account (the GitHub user id, the OIDC `sub`). The pairwise subject is derived from it on the host,
 * where the salt lives.
 */
export const vUpstreamIdentity = object({
  connector: string(),
  upstreamId: string(),
  email: optional(string()),
  emailVerified: optional(boolean()),
  name: optional(string()),
  picture: optional(string()),
});

/** The fields every authorization request carries from `/authorize` until it is deleted. */
const authRequestFields = {
  requestId: string(),
  appId: string(),
  clientId: string(),
  redirectUri: string(),
  scope: string(),
  state: optional(string()),
  nonce: optional(string()),
  codeChallenge: string(),
  /** `prompt=login` or `max_age` was sent: the connector must reauthenticate or refuse. */
  freshLogin: boolean(),
  /**
   * SHA-256 hex of the request's transaction cookie, set by `/authorize`. `/continue` and the
   * connector callback need the cookie, so only the browser that started the request can move it on.
   */
  txnCookieHash: string(),
  createdAt: number(),
  expiresAt: number(),
};

export const vAuthRequest = union(
  // Stored by /authorize; the user has not chosen a connector yet.
  object({ status: literal("pending"), ...authRequestFields }),
  // Redirected to an OAuth or OIDC connector; its callback claims the request by the state hash.
  object({
    status: literal("upstream"),
    ...authRequestFields,
    connector: string(),
    upstreamStateHash: string(),
    upstreamCodeVerifier: string(),
    upstreamNonce: optional(string()),
  }),
  // The connector callback arrived and the code exchange is running; a replay finds this and stops.
  object({ status: literal("claimed"), ...authRequestFields, connector: string() }),
  // The connector attested the identity; the authorization code points here until it is exchanged.
  object({
    status: literal("completed"),
    ...authRequestFields,
    identity: vUpstreamIdentity,
    authTime: number(),
  }),
);

export default defineSchema({
  apps: defineTable({
    appId: string(),
    name: string(),
    firstParty: boolean(),
    /**
     * The one connector of a third-party app. The app goes straight to it, and no other connector can
     * sign in to the app. Absent on a first-party app.
     */
    connector: optional(string()),
    tenantId: string(),
    createdAt: number(),
  })
    .index("by_app_id", ["appId"])
    .index("by_tenant_id", ["tenantId"]),

  /**
   * One row for each tenant that `registration.register` has seen. It stays when the tenant's apps
   * go. A repository's tenant is `gh-<its GitHub id>`.
   */
  tenants: defineTable({
    tenantId: string(),
    /**
     * The owner that the newest registration named, such as the id of the GitHub account that owns
     * the repository. An owner block in `blocks` stops every tenant whose owner it is.
     */
    ownerId: optional(string()),
    /**
     * The issue time, in seconds, of the newest accepted proof of the owner, such as the `iat` of a
     * GitHub OIDC token. A proof that names another owner and is older than this is refused, so a
     * replayed old proof cannot move a transferred repository back. Absent: no proof was recorded.
     */
    ownerProofIssuedAt: optional(number()),
  }).index("by_tenant_id", ["tenantId"]),

  /**
   * The one block state: one row per blocked repository or owner, set by the hub's administrator
   * with `moderation.setBlock`. While a row exists, no client of the repository, or of any repository
   * whose recorded owner it is, can register, renew, or sign in, also clients of apps made later.
   * Unblocking deletes the row. A block needs no tenant row, so it holds for a repository that never
   * registered.
   */
  blocks: defineTable({
    kind: vBlockKind,
    /** The repository's or the owner's numeric GitHub id. */
    githubId: string(),
    reason: string(),
    /** The email of the administrator who set it. */
    adminEmail: string(),
    at: number(),
  })
    .index("by_kind_and_github_id", ["kind", "githubId"])
    .index("by_at", ["at"]),

  /**
   * Append-only history, never changed or deleted. `registration`: one row per client that
   * `POST /hub-clients` created, written with the client; it outlives the client, so it answers the
   * registration counts and whether an owner has ever registered. `block_change`: one row per block
   * and unblock that changed something.
   */
  events: defineTable(
    union(
      object({
        kind: literal("registration"),
        clientId: string(),
        githubRepositoryDatabaseId: string(),
        githubOwnerId: string(),
        at: number(),
      }),
      object({
        kind: literal("block_change"),
        action: union(literal("block"), literal("unblock")),
        scope: vBlockKind,
        githubId: string(),
        reason: string(),
        adminEmail: string(),
        at: number(),
      }),
    ),
  )
    .index("by_kind_and_at", ["kind", "at"])
    .index("by_github_owner_id", ["githubOwnerId"]),

  /**
   * The initial access token of an app (RFC 7591 section 1.2), one row per repository and app name,
   * shared by the production app and its preview app. A production registration at
   * `POST /hub-clients` answers the token once and writes its hash here, in the transaction that
   * creates the client, replacing the row of the app, so the previous token stops. A registration
   * under another owner deletes the repository's rows. The row holds no token.
   */
  initialAccessTokens: defineTable({
    /** The SHA-256 of the token, in hex. */
    tokenHash: string(),
    githubRepositoryDatabaseId: string(),
    /** The repository's owner at the production run. */
    githubOwnerId: string(),
    /** `owner/name` at the production run. */
    githubRepository: string(),
    /** The name that the app's stack gives itself. */
    app: string(),
    issuedAt: number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_repository_and_app", ["githubRepositoryDatabaseId", "app"]),

  /**
   * The fixed one-hour windows of `POST /hub-clients`, one row per repository, per owner, and one
   * for all new owners. The repository and owner rows count admitted requests; the new-owners row
   * counts owners whose first registration succeeded.
   */
  rateLimits: defineTable({
    scope: vRateLimitScope,
    /** The repository or owner id. Empty for `new_owners`. */
    githubId: string(),
    startedAt: number(),
    count: number(),
  }).index("by_scope_and_github_id", ["scope", "githubId"]),

  clients: defineTable({
    clientId: string(),
    appId: string(),
    secretHash: string(),
    tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
    redirectUri: string(),
    deploymentType: vDeploymentType,
    clientName: string(),
    softwareVersion: string(),
    createdAt: number(),
    lastSignInAt: optional(number()),
    /** SHA-256 hex of the registration access token (RFC 7592). */
    registrationTokenHash: string(),
    /**
     * When `cleanup` deletes the client. Absent: never by date. Only a preview or development
     * client gets one.
     */
    removeAt: optional(number()),
    /** The registration of the client, or its last renewal at `/register/<client>`. */
    renewedAt: number(),
    /** The name that the app's stack gives itself, at most 64 characters. */
    app: string(),
    /** Who made the client. */
    registeredBy: vRegisteredBy,
  })
    .index("by_client_id", ["clientId"])
    .index("by_app_id", ["appId"])
    .index("by_deployment_type_and_activity", ["deploymentType", "lastSignInAt", "createdAt"])
    .index("by_remove_at", ["removeAt"]),

  authRequests: defineTable(vAuthRequest)
    .index("by_request_id", ["requestId"])
    .index("by_upstream_state_hash", ["upstreamStateHash"])
    .index("by_expires_at", ["expiresAt"]),

  authorizationCodes: defineTable(
    union(
      object({
        codeHash: string(),
        authRequestId: v.id("authRequests"),
        clientId: string(),
        expiresAt: number(),
        usedAt: optional(number()),
      }),
      object({
        codeHash: string(),
        resourceRequestId: v.id("resourceRequests"),
        clientId: string(),
        expiresAt: number(),
        usedAt: optional(number()),
        refreshGrantId: optional(v.id("refreshGrants")),
      }),
    ),
  )
    .index("by_code_hash", ["codeHash"])
    .index("by_expires_at", ["expiresAt"]),

  resourceRequests: defineTable(vResourceRequest)
    .index("by_request_id", ["requestId"])
    .index("by_upstream_state_hash", ["upstreamStateHash"])
    .index("by_expires_at", ["expiresAt"]),

  refreshGrants: defineTable(vRefreshGrant)
    .index("by_token_hash", ["tokenHash"])
    .index("by_client_id", ["clientId"])
    .index("by_expires_at", ["expiresAt"]),

  signIns: defineTable({
    appId: string(),
    clientId: string(),
    connector: string(),
    sub: string(),
    at: number(),
  })
    .index("by_app_id_and_at", ["appId", "at"])
    .index("by_at", ["at"]),
});
