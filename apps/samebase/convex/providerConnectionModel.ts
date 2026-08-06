import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vMcpTokenHealth } from "./mcpTokenHealth";

const { id, literal, number, object, optional, string, union } = v;

export const vProviderKind = union(literal("convex"), literal("cloudflare"));
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

const vProviderConnectionIdentity = {
  organizationId: id("organizations"),
  connectedByUserId: id("users"),
  createdAt: number(),
  updatedAt: number(),
};

export const vConvexProviderConnection = object({
  kind: literal("convex"),
  ...vProviderConnectionIdentity,
  auth: vStandardProviderAuth,
  teamId: string(),
  teamSlug: optional(string()),
});
export const vCloudflareProviderConnection = object({
  kind: literal("cloudflare"),
  ...vProviderConnectionIdentity,
  auth: vCloudflareProviderAuth,
  defaultAccount: vCloudflareDefaultAccount,
  tokenHealth: optional(vMcpTokenHealth),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
});
export const vProviderConnection = union(vConvexProviderConnection, vCloudflareProviderConnection);
export type ProviderConnection = Infer<typeof vProviderConnection>;

export const vOAuthProvider = union(
  literal("convex"),
  literal("cloudflare"),
  literal("cloudflare_mcp"),
);
export type OAuthProvider = Infer<typeof vOAuthProvider>;

export const vProviderOAuthCallbackState = object({
  provider: vOAuthProvider,
  userId: id("users"),
  organizationId: id("organizations"),
  providerConnectionId: optional(id("providerConnections")),
  state: string(),
  returnToPath: optional(string()),
  codeVerifier: optional(string()),
  clientId: optional(string()),
  clientSecret: optional(string()),
  createdAt: number(),
  expiresAt: number(),
});

export const providerConnectionTables = {
  /** Provider credentials and account choices saved for one organization. */
  providerConnections: defineTable(vProviderConnection)
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_kind", ["organizationId", "kind"])
    // Legacy deployment index. Singleton resolution uses by_organization_and_kind.
    .index("by_organization_and_kind_and_team_id", ["organizationId", "kind", "teamId"])
    .index("by_connected_by_user", ["connectedByUserId"])
    .index("by_kind_method", ["kind", "auth.method"]),

  /** Short-lived requests that bind a provider OAuth callback to an organization. */
  providerOAuthCallbackStates: defineTable(vProviderOAuthCallbackState)
    .index("by_state", ["state"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"]),
};
