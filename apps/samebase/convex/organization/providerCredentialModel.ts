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

const vCloudflareCiCredential = object({
  apiToken: string(),
  accountId: string(),
  ...providerCredentialIdentity,
});
const vConvexCiCredential = object({
  accessToken: string(),
  teamId: string(),
  ...providerCredentialIdentity,
});

/**
CI credentials that Samebase writes into a repository_actions repository as GitHub Actions secrets.
The user pastes both; the row stores the token values. A row holds at least one entry, and each entry
belongs to the member who saved it.
*/
export const vOrganizationCiCredentials = union(
  object({
    organizationId: id("organizations"),
    cloudflare: vCloudflareCiCredential,
    convex: optional(vConvexCiCredential),
  }),
  object({
    organizationId: id("organizations"),
    cloudflare: optional(vCloudflareCiCredential),
    convex: vConvexCiCredential,
  }),
);
export type OrganizationCiCredentials = Infer<typeof vOrganizationCiCredentials>;
export type CompleteOrganizationCiCredentials = {
  cloudflare: Infer<typeof vCloudflareCiCredential>;
  convex: Infer<typeof vConvexCiCredential>;
};

/**
The revision of the CI credentials that a repository holds: the later `updatedAt` of the two tokens.
Saving either token again gives a higher revision, so the repositories with a lower one are stale.
*/
export function readCiCredentialRevision(ci: CompleteOrganizationCiCredentials): number {
  return Math.max(ci.cloudflare.updatedAt, ci.convex.updatedAt);
}

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
  The CI tokens of one organization, separate from Samebase's own provider credentials so that a
  provider disconnect never removes them. Owners save them on the Providers page; repository_actions
  provisioning copies them into each new repository; account deletion removes the entries that the
  deleted member saved.
  */
  organizationCiCredentials: defineTable(vOrganizationCiCredentials)
    .index("by_organization", ["organizationId"])
    .index("by_cloudflare_connected_by_user", ["cloudflare.connectedByUserId"])
    .index("by_convex_connected_by_user", ["convex.connectedByUserId"]),

  /** Short-lived requests that bind a provider OAuth callback to an organization. */
  providerOAuthCallbackStates: defineTable(vProviderOAuthCallbackState)
    .index("by_state", ["state"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"]),
};
