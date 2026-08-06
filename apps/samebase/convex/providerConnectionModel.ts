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
export const vProviderAuth = union(vOAuthAuth, vCloudflareOAuthAuth, vMcpOAuthAuth, vApiKeyAuth);
export type ProviderAuth = Infer<typeof vProviderAuth>;

export function providerAuthMatches(left: ProviderAuth, right: ProviderAuth): boolean {
  if (left.method !== right.method) {
    return false;
  }
  switch (left.method) {
    case "api_key":
      return right.method === "api_key" && left.credential === right.credential;
    case "oauth":
      if (right.method !== "oauth" || left.credential !== right.credential) {
        return false;
      }
      if ("refreshCredential" in left || "refreshCredential" in right) {
        return (
          "refreshCredential" in left &&
          "refreshCredential" in right &&
          left.refreshCredential === right.refreshCredential &&
          left.credentialExpiresAt === right.credentialExpiresAt
        );
      }
      return true;
    case "mcp_oauth":
      return (
        right.method === "mcp_oauth" &&
        left.credential === right.credential &&
        left.refreshCredential === right.refreshCredential &&
        left.credentialExpiresAt === right.credentialExpiresAt &&
        left.clientId === right.clientId
      );
  }
}

export function requireCloudflareAuthUsableDuringRefresh(
  auth: Infer<typeof vCloudflareProviderAuth>,
  now: number,
): void {
  if ((auth.method === "oauth" || auth.method === "mcp_oauth") && auth.credentialExpiresAt <= now) {
    throw new Error("Cloudflare token refresh is in progress. Retry shortly.");
  }
}
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

const vCloudflareProviderTarget = union(
  object({ state: literal("not_selected") }),
  object({ state: literal("selected"), accountId: string() }),
);
export const vProviderConnectionTarget = union(
  object({ kind: literal("convex"), teamId: string() }),
  object({ kind: literal("cloudflare"), account: vCloudflareProviderTarget }),
);
export type ProviderConnectionTarget = Infer<typeof vProviderConnectionTarget>;

type ProviderConnectionTargetSource =
  | { kind: "convex"; teamId: string }
  | { kind: "cloudflare"; defaultAccount: CloudflareDefaultAccount };

export function readProviderConnectionTarget(
  connection: ProviderConnectionTargetSource,
): ProviderConnectionTarget {
  switch (connection.kind) {
    case "convex":
      return { kind: "convex", teamId: connection.teamId };
    case "cloudflare":
      return {
        kind: "cloudflare",
        account:
          connection.defaultAccount.state === "not_selected"
            ? { state: "not_selected" }
            : {
                state: "selected",
                accountId: connection.defaultAccount.accountId,
              },
      };
  }
}

export function providerConnectionTargetMatches(
  connection: ProviderConnectionTargetSource,
  expected: ProviderConnectionTarget,
): boolean {
  const current = readProviderConnectionTarget(connection);
  if (current.kind !== expected.kind) {
    return false;
  }
  switch (current.kind) {
    case "convex":
      return expected.kind === "convex" && current.teamId === expected.teamId;
    case "cloudflare":
      if (expected.kind !== "cloudflare" || current.account.state !== expected.account.state) {
        return false;
      }
      return (
        current.account.state === "not_selected" ||
        (expected.account.state === "selected" &&
          current.account.accountId === expected.account.accountId)
      );
  }
}

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
  expectedAuthFingerprint: optional(string()),
  expectedTarget: optional(vProviderConnectionTarget),
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
