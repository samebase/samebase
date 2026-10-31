import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import type { Id } from "../_generated/dataModel";

import { vMcpTokenHealth } from "../mcpTokenHealth";
import { vCloudflareProviderAuth, vStandardProviderAuth } from "../providerAuth";
import { vSealedSecret } from "../sealedSecret";

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
  apiToken: vSealedSecret,
  accountId: string(),
  ...providerCredentialIdentity,
});
const vConvexCiCredential = object({
  accessToken: vSealedSecret,
  teamId: string(),
  ...providerCredentialIdentity,
});

/**
CI credentials that an owner pasted on the Providers page. The row stores the token values, and no
repository creation reads them. A row holds at least one entry, and each entry belongs to the member
who saved it.
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

/**
The additional authenticated data of a sealed provider credential: a sealed value opens only in the
organization and the field it was sealed for.
*/
export function organizationProviderCredentialAad(
  organizationId: Id<"organizations">,
  field:
    | "convex.auth.credential"
    | "cloudflare.auth.credential"
    | "cloudflare.auth.refreshCredential",
): string {
  return `organizationProviderCredentials/${organizationId}/${field}`;
}

/** The additional authenticated data of a sealed CI token. */
export function organizationCiCredentialAad(
  organizationId: Id<"organizations">,
  field: "cloudflare.apiToken" | "convex.accessToken",
): string {
  return `organizationCiCredentials/${organizationId}/${field}`;
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
  provider disconnect never removes them. Owners save them on the Providers page; account deletion
  removes the entries that the deleted member saved.
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
