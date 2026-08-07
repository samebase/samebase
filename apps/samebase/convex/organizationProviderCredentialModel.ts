import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vMcpTokenHealth } from "./mcpTokenHealth";
import { vCloudflareProviderAuth, vStandardProviderAuth } from "./providerAuth";

const { id, literal, number, object, optional, string, union } = v;

const providerCredentialIdentity = {
  connectedByUserId: id("users"),
  updatedAt: number(),
};

export const vConvexProviderCredential = object({
  ...providerCredentialIdentity,
  auth: vStandardProviderAuth,
});
export type ConvexProviderCredential = Infer<typeof vConvexProviderCredential>;

export const vCloudflareTokenRefreshLease = object({
  startedAt: number(),
  expiresAt: number(),
});

export const vCloudflareProviderCredential = object({
  ...providerCredentialIdentity,
  auth: vCloudflareProviderAuth,
  tokenHealth: optional(vMcpTokenHealth),
  tokenRefreshLease: optional(vCloudflareTokenRefreshLease),
  lastTokenRefreshAt: optional(number()),
});
export type CloudflareProviderCredential = Infer<typeof vCloudflareProviderCredential>;

export const vOrganizationProviderCredentials = object({
  convex: optional(vConvexProviderCredential),
  cloudflare: optional(vCloudflareProviderCredential),
});

export const vOAuthProvider = union(
  literal("convex"),
  literal("cloudflare"),
  literal("cloudflare_mcp"),
);
export type OAuthProvider = Infer<typeof vOAuthProvider>;

const providerOAuthCallbackStateFields = {
  userId: id("users"),
  organizationId: id("organizations"),
  expectedProviderSnapshotHash: string(),
  state: string(),
  createdAt: number(),
  expiresAt: number(),
};

export const vConvexProviderOAuthCallbackState = object({
  provider: literal("convex"),
  ...providerOAuthCallbackStateFields,
  codeVerifier: string(),
});
export const vCloudflareProviderOAuthCallbackState = object({
  provider: literal("cloudflare"),
  ...providerOAuthCallbackStateFields,
});
export const vCloudflareMcpProviderOAuthCallbackState = object({
  provider: literal("cloudflare_mcp"),
  ...providerOAuthCallbackStateFields,
  codeVerifier: string(),
  clientId: string(),
});
export const vProviderOAuthCallbackState = union(
  vConvexProviderOAuthCallbackState,
  vCloudflareProviderOAuthCallbackState,
  vCloudflareMcpProviderOAuthCallbackState,
);

export const organizationProviderCredentialTables = {
  /** Backend-only Convex and Cloudflare credentials for one organization. */
  organizationProviderCredentials: defineTable(vOrganizationProviderCredentials)
    .index("by_convex_connected_by_user", ["convex.connectedByUserId"])
    .index("by_cloudflare_connected_by_user", ["cloudflare.connectedByUserId"]),

  /** Short-lived requests that bind a provider OAuth callback to an organization. */
  providerOAuthCallbackStates: defineTable(vProviderOAuthCallbackState)
    .index("by_state", ["state"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"]),
};
