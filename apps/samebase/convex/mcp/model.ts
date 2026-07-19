import { defineTable } from "convex/server";
import { v } from "convex/values";

const { array, id, literal, number, optional, string, union } = v;

export const vMcpOauthClientRegistrationStatus = union(
  literal("provisional"),
  literal("active"),
  literal("expired"),
  literal("disabled"),
);
export const vMcpAuthRequestStatus = union(
  literal("pending"),
  literal("approved"),
  literal("denied"),
  literal("expired"),
);
export const mcpTables = {
  /** OAuth clients registered against samebase.com. */
  mcpOauthClients: defineTable({
    clientId: string(),
    clientName: optional(string()),
    redirectUris: array(string()),
    grantTypes: array(string()),
    responseTypes: array(string()),
    tokenEndpointAuthMethod: literal("none"),
    createdAt: number(),
    updatedAt: number(),
    createdBy: union(literal("dynamic_registration"), literal("manual")),
    registrationStatus: vMcpOauthClientRegistrationStatus,
    provisionalExpiresAt: optional(number()),
    firstTokenExchangedAt: optional(number()),
    metadataJson: string(),
  })
    .index("by_client_id", ["clientId"])
    .index("by_registration_status", ["registrationStatus"])
    .index("by_provisional_expires_at", ["provisionalExpiresAt"]),

  /** One pending MCP OAuth request awaiting a user's browser consent decision. */
  mcpAuthorizationRequests: defineTable({
    requestId: string(),
    clientId: string(),
    redirectUri: string(),
    resource: string(),
    scope: string(),
    state: optional(string()),
    codeChallenge: string(),
    codeChallengeMethod: literal("S256"),
    userId: optional(id("users")),
    status: vMcpAuthRequestStatus,
    createdAt: number(),
    expiresAt: number(),
  })
    .index("by_request_id", ["requestId"])
    .index("by_user_id", ["userId"])
    .index("by_client_id", ["clientId"])
    .index("by_status", ["status"])
    .index("by_expires_at", ["expiresAt"]),

  /** Hashed one-use codes exchanged by approved MCP clients for access and refresh tokens. */
  mcpAuthorizationCodes: defineTable({
    codeHash: string(),
    requestId: string(),
    grantId: string(),
    clientId: string(),
    userId: id("users"),
    redirectUri: string(),
    resource: string(),
    scope: string(),
    expiresAt: number(),
    usedAt: optional(number()),
  })
    .index("by_code_hash", ["codeHash"])
    .index("by_user_id", ["userId"])
    .index("by_grant_id", ["grantId"])
    .index("by_client_id", ["clientId"])
    .index("by_expires_at", ["expiresAt"]),

  /** Durable OAuth grants for MCP clients. */
  mcpGrants: defineTable({
    grantId: string(),
    userId: id("users"),
    clientId: string(),
    resource: string(),
    scope: string(),
    status: union(literal("active"), literal("revoked")),
    createdAt: number(),
    updatedAt: number(),
    lastUsedAt: optional(number()),
    metadataJson: optional(string()),
  })
    .index("by_grant_id", ["grantId"])
    .index("by_user_id", ["userId"])
    .index("by_user_id_and_status", ["userId", "status"])
    .index("by_client_id", ["clientId"])
    .index("by_status", ["status"]),

  /** Hashed bearer tokens authorizing MCP resource calls until expiry or revocation. */
  mcpAccessTokens: defineTable({
    tokenHash: string(),
    grantId: string(),
    clientId: string(),
    userId: id("users"),
    resource: string(),
    scope: string(),
    createdAt: number(),
    expiresAt: number(),
    lastUsedAt: optional(number()),
    revokedAt: optional(number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_grant_id", ["grantId"])
    .index("by_user_id", ["userId"])
    .index("by_expires_at", ["expiresAt"]),

  /** Hashed rotating credentials used to mint replacement MCP tokens. */
  mcpRefreshTokens: defineTable({
    grantId: string(),
    clientId: string(),
    userId: id("users"),
    tokenHash: string(),
    status: union(literal("active"), literal("rotated"), literal("revoked"), literal("expired")),
    createdAt: number(),
    expiresAt: optional(number()),
    rotatedAt: optional(number()),
    replacedByTokenHash: optional(string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_grant_id", ["grantId"])
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"])
    .index("by_expires_at", ["expiresAt"]),

  /**
   * Hashes of one-use tokens that an authorized MCP client sends to a browser
   * to start a Samebase session for the grant's user.
   */
  mcpBrowserLoginTokens: defineTable({
    tokenHash: string(),
    userId: id("users"),
    grantId: string(),
    clientId: string(),
    // Deprecated rollout field. New tokens never write it; legacy rows expire after five minutes.
    returnToPath: optional(string()),
    createdAt: number(),
    expiresAt: number(),
    consumedAt: optional(number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_id", ["userId"])
    .index("by_grant_id", ["grantId"]),

  /** One immutable MCP OAuth action, never read to authorize live requests. */
  audit_mcpAccess_events: defineTable({
    grantId: optional(string()),
    clientId: optional(string()),
    userId: optional(id("users")),
    action: string(),
    createdAt: number(),
    detailsJson: optional(string()),
  })
    .index("by_grant_id", ["grantId"])
    .index("by_client_id", ["clientId"])
    .index("by_user_id", ["userId"])
    .index("by_action", ["action"]),
};
