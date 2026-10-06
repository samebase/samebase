import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import { vMcpTokenHealth } from "../mcpTokenHealth";
import { vCloudflareProviderAuth, vStandardProviderAuth } from "../providerAuth";

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

/**
The CI credential that Samebase writes into a repository_actions repository as GitHub Actions
secrets: a Cloudflare user API token that an owner pastes; the row stores the token value. The Convex
token of each repository is minted from the Convex connection instead and never stored.
*/
export const vOrganizationCiCredentials = object({
  organizationId: id("organizations"),
  cloudflare: object({
    apiToken: string(),
    accountId: string(),
    ...providerCredentialIdentity,
  }),
});
export type OrganizationCiCredentials = Infer<typeof vOrganizationCiCredentials>;

export const vOrganizationProviderCredentials = union(
  object({
    organizationId: id("organizations"),
    convex: vConvexProviderCredential,
    cloudflare: optional(vCloudflareProviderCredential),
  }),
  object({
    organizationId: id("organizations"),
    convex: optional(vConvexProviderCredential),
    cloudflare: vCloudflareProviderCredential,
  }),
);

export const vProviderOAuthStoreResult = union(
  object({ status: literal("stored") }),
  object({ status: literal("access_lost") }),
  object({ status: literal("configuration_changed") }),
  object({ status: literal("target_mismatch") }),
);
export type ProviderOAuthStoreResult = Infer<typeof vProviderOAuthStoreResult>;

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
  returnToPath: optional(string()),
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
    .index("by_organization", ["organizationId"])
    .index("by_convex_connected_by_user", ["convex.connectedByUserId"])
    .index("by_cloudflare_connected_by_user", ["cloudflare.connectedByUserId"])
    .index("by_cloudflare_token_refresh_expiry", ["cloudflare.tokenRefreshLease.expiresAt"]),

  /**
  The CI token of one organization, separate from Samebase's own provider credentials so that a
  provider disconnect never removes it. An owner saves it on the Providers page; repository_actions
  provisioning copies it into each new repository; account deletion removes it when the deleted
  member saved it; organization deletion removes it.
  */
  organizationCiCredentials: defineTable(vOrganizationCiCredentials)
    .index("by_organization", ["organizationId"])
    .index("by_cloudflare_connected_by_user", ["cloudflare.connectedByUserId"]),

  /** Short-lived requests that bind a provider OAuth callback to an organization. */
  providerOAuthCallbackStates: defineTable(vProviderOAuthCallbackState)
    .index("by_state", ["state"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"]),
};
