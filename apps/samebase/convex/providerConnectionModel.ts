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

const providerConnectionIdentity = {
  organizationId: id("organizations"),
  connectedByUserId: id("users"),
  createdAt: number(),
  updatedAt: number(),
} as const;

export const vConnectedGithubProviderConnection = object({
  state: literal("connected"),
  kind: literal("github"),
  ...providerConnectionIdentity,
  auth: vStandardProviderAuth,
  accountId: string(),
  username: optional(string()),
});
export const vDisconnectedGithubProviderConnection = object({
  state: literal("disconnected"),
  kind: literal("github"),
  ...providerConnectionIdentity,
  accountId: string(),
  username: optional(string()),
  disconnectedAt: number(),
});
export const vConnectedConvexProviderConnection = object({
  state: literal("connected"),
  kind: literal("convex"),
  ...providerConnectionIdentity,
  auth: vStandardProviderAuth,
  teamId: string(),
  teamSlug: optional(string()),
});
export const vDisconnectedConvexProviderConnection = object({
  state: literal("disconnected"),
  kind: literal("convex"),
  ...providerConnectionIdentity,
  teamId: string(),
  teamSlug: optional(string()),
  disconnectedAt: number(),
});
export const vConnectedCloudflareProviderConnection = object({
  state: literal("connected"),
  kind: literal("cloudflare"),
  ...providerConnectionIdentity,
  auth: vCloudflareProviderAuth,
  defaultAccount: vCloudflareDefaultAccount,
  tokenHealth: optional(vMcpTokenHealth),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
});
export const vDisconnectedCloudflareProviderConnection = object({
  state: literal("disconnected"),
  kind: literal("cloudflare"),
  ...providerConnectionIdentity,
  defaultAccount: vCloudflareDefaultAccount,
  disconnectedAt: number(),
});

export const vProviderConnection = union(
  vConnectedGithubProviderConnection,
  vDisconnectedGithubProviderConnection,
  vConnectedConvexProviderConnection,
  vDisconnectedConvexProviderConnection,
  vConnectedCloudflareProviderConnection,
  vDisconnectedCloudflareProviderConnection,
);
export type ProviderConnection = Infer<typeof vProviderConnection>;

export const vConnectedProviderConnection = union(
  vConnectedGithubProviderConnection,
  vConnectedConvexProviderConnection,
  vConnectedCloudflareProviderConnection,
);
export type ConnectedProviderConnection = Infer<typeof vConnectedProviderConnection>;

export const providerConnectionTables = {
  /** Provider credentials held by an organization and used only in backend functions. */
  providerConnections: defineTable(vProviderConnection)
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_kind_and_state", ["organizationId", "kind", "state"])
    .index("by_connected_by_user", ["connectedByUserId"]),

  /** Short-lived OAuth state bound to the initiating user and organization. */
  providerOAuthCallbackStates: defineTable({
    provider: union(
      literal("github"),
      literal("convex"),
      literal("cloudflare"),
      literal("cloudflare_mcp"),
    ),
    userId: id("users"),
    organizationId: id("organizations"),
    providerConnectionId: optional(id("providerConnections")),
    state: string(),
    returnToPath: string(),
    codeVerifier: optional(string()),
    clientId: optional(string()),
    clientSecret: optional(string()),
    createdAt: number(),
    expiresAt: number(),
  })
    .index("by_state", ["state"])
    .index("by_user", ["userId"]),
};
