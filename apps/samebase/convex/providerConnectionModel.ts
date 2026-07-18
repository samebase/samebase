import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vMcpTokenHealth } from "./mcpTokenHealth";

const { id, literal, number, object, optional, string, union } = v;

export const vProviderKind = union(literal("github"), literal("convex"), literal("cloudflare"));
export type ProviderKind = Infer<typeof vProviderKind>;

export const vOAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
});
export const vCloudflareOAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
});
export const vMcpOAuthAuth = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
  clientId: string(),
});
export const vApiKeyAuth = object({
  method: literal("api_key"),
  credential: string(),
});
export const vStandardProviderAuth = union(vOAuthAuth, vApiKeyAuth);
export const vCloudflareProviderAuth = union(vCloudflareOAuthAuth, vMcpOAuthAuth, vApiKeyAuth);
export const vCloudflareDefaultAccount = union(
  object({
    state: literal("not_selected"),
  }),
  object({
    state: literal("selected"),
    accountId: string(),
    accountName: string(),
  }),
);
export type CloudflareDefaultAccount = Infer<typeof vCloudflareDefaultAccount>;

export const providerConnectionTables = {
  providerConnections: defineTable(
    union(
      object({
        kind: literal("github"),
        userId: id("users"),
        auth: vStandardProviderAuth,
        username: optional(string()),
        createdAt: number(),
        updatedAt: number(),
      }),
      object({
        kind: literal("convex"),
        userId: id("users"),
        auth: vStandardProviderAuth,
        teamId: string(),
        teamSlug: optional(string()),
        createdAt: number(),
        updatedAt: number(),
      }),
      object({
        kind: literal("cloudflare"),
        userId: id("users"),
        auth: vCloudflareProviderAuth,
        defaultAccount: vCloudflareDefaultAccount,
        tokenHealth: optional(vMcpTokenHealth),
        tokenRefreshStartedAt: optional(number()),
        lastTokenRefreshAt: optional(number()),
        createdAt: number(),
        updatedAt: number(),
      }),
    ),
  )
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_kind_method", ["kind", "auth.method"]),

  /** OAuth state records for provider integrations. */
  operations_providerOauthStates: defineTable({
    provider: union(
      literal("github"),
      literal("convex"),
      literal("cloudflare"),
      literal("cloudflare_mcp"),
    ),
    userId: id("users"),
    state: string(),
    returnToPath: optional(string()),
    codeVerifier: optional(string()),
    clientId: optional(string()),
    clientSecret: optional(string()),
    createdAt: number(),
    expiresAt: number(),
  })
    .index("by_state", ["state"])
    .index("by_user", ["userId"]),
};
