import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { Infer, v } from "convex/values";
import { vViewerAccess, vViewerRoleResult } from "./accessModelValidators";
import { getSelectedProviderConnectionForOrganization } from "./providerConnections";
import { requireOrganizationAccessContext } from "./organizationAccess";
import { action, mutation, query } from "./functions";
import { fetchConvexTeamTokenDetails } from "./convexManagementApi/client";
import { ConvexManagementApiError } from "./convexManagementApi/errors";
import {
  deriveMcpTokenStatusFromExpiry,
  vMcpTokenHealthStatus,
  type McpTokenHealth,
} from "./mcpTokenHealth";
import type { CloudflareDefaultAccount } from "./providerConnectionModel";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_PAGE_LOAD_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS,
} from "../shared/cloudflareTokenRefresh";
import type { AuthTokenAuthProvider } from "../shared/authTokenClaims";
import {
  normalizeAccountEmail,
  normalizeDisplayName,
  resolveAccountPresentation,
  vAccountPresentation,
} from "../shared/accountPresentation";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const vAuthTokenAuthProvider = union(literal("google"), literal("password"));
const vAuthProviderSummary = object({
  providers: array(vAuthTokenAuthProvider),
  primaryProvider: optional(vAuthTokenAuthProvider),
});

type AuthProviderAccountSummary = {
  _creationTime: number;
  _id: string;
  provider: string;
};

function readAuthTokenAuthProvider(provider: string): AuthTokenAuthProvider | null {
  switch (provider) {
    case "google":
    case "password":
      return provider;
    default:
      return null;
  }
}

const vProviderAuthMethod = union(literal("oauth"), literal("mcp_oauth"), literal("api_key"));
const vCloudflareDisconnectedConnectionStatus = object({
  connected: literal(false),
});
const vCloudflareConnectedConnectionStatus = object({
  connected: literal(true),
  accountId: optional(string()),
  accountName: optional(string()),
  authMethod: optional(vProviderAuthMethod),
  mcpTokenStatus: optional(vMcpTokenHealthStatus),
  mcpTokenExpiresAt: optional(number()),
  mcpTokenCheckedAt: optional(number()),
  mcpTokenRefreshStartedAt: optional(number()),
  mcpTokenLastRefreshAt: optional(number()),
  mcpTokenNextAutoCheckAt: optional(number()),
});
const vCloudflareConnectionStatus = union(
  vCloudflareDisconnectedConnectionStatus,
  vCloudflareConnectedConnectionStatus,
);
type ConnectedCloudflareConnectionStatus = Infer<typeof vCloudflareConnectedConnectionStatus>;
type CloudflareConnectionStatus = Infer<typeof vCloudflareConnectionStatus>;
type CloudflareConnectionStatusInput = {
  defaultAccount: CloudflareDefaultAccount;
  auth:
    | {
        method: "api_key";
      }
    | {
        method: "oauth";
        credentialExpiresAt: number;
      }
    | {
        method: "mcp_oauth";
        credentialExpiresAt: number;
      };
  tokenHealth?: McpTokenHealth;
  tokenRefreshStartedAt?: number;
  lastTokenRefreshAt?: number;
};
function normalizeApiToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error("API key is required");
  }
  return normalized;
}

function computeCloudflareNextAutoCheckAt(args: { expiresAt: number; now: number }): number {
  const refreshWindowStartAt = args.expiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS;
  if (args.now < refreshWindowStartAt) {
    return refreshWindowStartAt;
  }
  return args.now + CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS;
}

function computeCloudflareRetryDelayMs(previousCheckedAt: number | undefined, now: number): number {
  if (typeof previousCheckedAt !== "number") {
    return CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS;
  }
  const elapsedMs = Math.max(0, now - previousCheckedAt);
  if (elapsedMs <= CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS * 2) {
    return Math.min(
      CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS,
      CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS * 2,
    );
  }
  if (elapsedMs <= CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS * 4) {
    return Math.min(
      CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS,
      CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS * 4,
    );
  }
  return CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS;
}

function buildCloudflareConnectionStatus(
  connection: CloudflareConnectionStatusInput,
  options?: {
    now?: number;
    nextAutoCheckAt?: number;
  },
): ConnectedCloudflareConnectionStatus {
  const now = options?.now ?? Date.now();
  const baseStatus: ConnectedCloudflareConnectionStatus = {
    connected: true,
    ...(connection.defaultAccount.state === "selected"
      ? {
          accountId: connection.defaultAccount.accountId,
          accountName: connection.defaultAccount.accountName,
        }
      : {}),
    authMethod: connection.auth.method,
    mcpTokenRefreshStartedAt: connection.tokenRefreshStartedAt,
    mcpTokenLastRefreshAt: connection.lastTokenRefreshAt,
  };

  if (connection.auth.method !== "mcp_oauth") {
    return baseStatus;
  }

  const effectiveExpiresAt =
    connection.tokenHealth?.expiresAt ?? connection.auth.credentialExpiresAt;
  const derivedStatus = deriveMcpTokenStatusFromExpiry(effectiveExpiresAt, now);
  const storedStatus = connection.tokenHealth?.status;
  const shouldUseDerivedStatus =
    connection.tokenHealth?.checkedAt === undefined ||
    derivedStatus === "expired" ||
    derivedStatus === "expiring_soon";
  const mcpTokenStatus =
    storedStatus === "invalid"
      ? "invalid"
      : shouldUseDerivedStatus
        ? derivedStatus
        : (storedStatus ?? derivedStatus);
  const runtimeErrorCheckedAt = connection.tokenHealth?.checkedAt;
  const derivedNextAutoCheckAt =
    connection.tokenHealth?.source === "runtime_error"
      ? (runtimeErrorCheckedAt ?? now) + computeCloudflareRetryDelayMs(runtimeErrorCheckedAt, now)
      : computeCloudflareNextAutoCheckAt({
          expiresAt: effectiveExpiresAt,
          now,
        });
  const nextAutoCheckAt =
    mcpTokenStatus === "invalid" ? undefined : (options?.nextAutoCheckAt ?? derivedNextAutoCheckAt);
  return {
    ...baseStatus,
    mcpTokenStatus,
    mcpTokenExpiresAt: effectiveExpiresAt,
    mcpTokenCheckedAt: connection.tokenHealth?.checkedAt,
    ...(typeof nextAutoCheckAt === "number" ? { mcpTokenNextAutoCheckAt: nextAutoCheckAt } : {}),
  };
}

async function fetchConvexApiKeyTeamDetails(token: string): Promise<{
  teamId: string;
}> {
  try {
    return await fetchConvexTeamTokenDetails(token);
  } catch (error) {
    if (
      error instanceof ConvexManagementApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      throw new Error("Invalid Convex API key");
    }
    if (error instanceof ConvexManagementApiError) {
      throw new Error(`Convex API key check failed (${error.status}).`);
    }
    throw new Error("Convex API key check failed.");
  }
}

// Public

export const viewer = query({
  access: "access_public",
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      accountPresentation: vAccountPresentation,
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = ctx.viewer.userId;
    const user = ctx.viewer.user;
    if (userId === null || !user) {
      return null;
    }

    return {
      _id: user._id,
      accountPresentation: resolveAccountPresentation(user),
    };
  },
});

export const getUserSettings = query({
  access: "access_user_preferences",
  args: {},
  returns: object({
    displayName: optional(string()),
    signInEmail: string(),
  }),
  handler: async (ctx) => {
    const user = ctx.viewer.user;
    return {
      displayName:
        user.displayName === undefined ? undefined : normalizeDisplayName(user.displayName),
      signInEmail: normalizeAccountEmail(user.email),
    };
  },
});

export const setDisplayName = mutation({
  access: "access_user_preferences",
  args: {
    displayName: union(string(), v.null()),
  },
  returns: vAccountPresentation,
  handler: async (ctx, args) => {
    const displayName =
      args.displayName === null ? undefined : normalizeDisplayName(args.displayName);
    const accountPresentation = resolveAccountPresentation({
      email: ctx.viewer.user.email,
      ...(displayName === undefined ? {} : { displayName }),
    });
    await ctx.db.patch("users", ctx.viewer.userId, {
      displayName,
    });
    return accountPresentation;
  },
});

export const getViewerAuthProviders = query({
  access: "access_public",
  args: {},
  returns: vAuthProviderSummary,
  handler: async (ctx) => {
    const userId = ctx.viewer.userId;
    if (userId === null) {
      return { providers: [] };
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    const orderedAccounts = [...accounts].sort((first, second) =>
      compareAuthProviderAccountSummary(first, second),
    );

    const providers: AuthTokenAuthProvider[] = [];
    const seen = new Set<string>();
    for (const account of orderedAccounts) {
      const provider = readAuthTokenAuthProvider(account.provider);
      if (provider === null || seen.has(provider)) {
        continue;
      }
      seen.add(provider);
      providers.push(provider);
    }

    if (providers.length > 0) {
      return { providers, primaryProvider: providers[0] };
    }
    return { providers };
  },
});

export const getPrimaryAuthProviderForToken = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: v.union(vAuthTokenAuthProvider, v.null()),
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .take(32);
    const orderedAccounts = [...accounts].sort((first, second) =>
      compareAuthProviderAccountSummary(first, second),
    );

    for (const account of orderedAccounts) {
      const provider = readAuthTokenAuthProvider(account.provider);
      if (provider !== null) {
        return provider;
      }
    }
    return null;
  },
});

/**
 * Sort auth provider accounts newest-first with `_id` as a deterministic
 * tie-breaker so the displayed primary provider cannot drift between reads.
 */
function compareAuthProviderAccountSummary(
  first: AuthProviderAccountSummary,
  second: AuthProviderAccountSummary,
) {
  const creationTimeOrder = second._creationTime - first._creationTime;
  if (creationTimeOrder !== 0) {
    return creationTimeOrder;
  }
  return second._id.localeCompare(first._id);
}

export const currentViewerAccess = query({
  access: "access_public",
  args: {},
  returns: vViewerAccess,
  handler: async (ctx) => {
    return {
      role: ctx.viewer.role,
      accessKeys: [...ctx.viewer.accessKeys],
    };
  },
});

export const currentViewerRole = query({
  access: "access_public",
  args: {},
  returns: vViewerRoleResult,
  handler: async (ctx) => {
    return { role: ctx.viewer.role };
  },
});

export const getConvexConnectionStatus = query({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: v.object({
    connected: boolean(),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
    authMethod: v.optional(vProviderAuthMethod),
  }),
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const connection = await getSelectedProviderConnectionForOrganization(ctx.db, {
      organizationId: access.organizationId,
      kind: "convex",
    });
    if (connection?.kind !== "convex") {
      return { connected: false };
    }

    return {
      connected: true,
      teamId: connection.teamId,
      teamSlug: connection.teamSlug,
      authMethod: connection.auth.method,
    };
  },
});

export const disconnectConvex = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const connection = await ctx.runQuery(
      internal.providerConnections.loadSelectedForOrganization,
      { organizationId, userId: ctx.viewer.userId, kind: "convex" },
    );
    if (connection?.kind === "convex") {
      await ctx.runMutation(internal.providerConnections.disconnect, {
        organizationId,
        disconnectedByUserId: ctx.viewer.userId,
        providerConnectionId: connection._id,
        kind: "convex",
      });
    }
    return null;
  },
});

export const getCloudflareConnectionStatus = query({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vCloudflareConnectionStatus,
  handler: async (ctx, args) => {
    const access = await requireOrganizationAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const connection = await getSelectedProviderConnectionForOrganization(ctx.db, {
      organizationId: access.organizationId,
      kind: "cloudflare",
    });
    if (connection?.kind !== "cloudflare") {
      return { connected: false } satisfies CloudflareConnectionStatus;
    }

    return buildCloudflareConnectionStatus(connection);
  },
});

const vCloudflareAutoRefreshTrigger = union(
  literal("focus"),
  literal("visibility"),
  literal("page_load"),
  literal("poll"),
  literal("manual"),
);
type CloudflareAutoRefreshTrigger = Infer<typeof vCloudflareAutoRefreshTrigger>;

async function runCloudflareMcpTokenRefresh(args: {
  ctx: ActionCtx;
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  trigger: CloudflareAutoRefreshTrigger;
  force?: boolean;
}): Promise<CloudflareConnectionStatus> {
  const organizationId = await args.ctx.runQuery(
    internal.organizationAccess.requireOrganizationIdForUser,
    { userId: args.userId, organizationId: args.organizationId },
  );
  const connection = await args.ctx.runQuery(
    internal.providerConnections.loadSelectedForOrganization,
    { organizationId, userId: args.userId, kind: "cloudflare" },
  );
  if (connection?.kind !== "cloudflare") {
    return { connected: false } satisfies CloudflareConnectionStatus;
  }
  if (connection.auth.method !== "mcp_oauth") {
    return buildCloudflareConnectionStatus(connection);
  }

  const forceRefresh = args.force === true || args.trigger === "manual";
  const now = Date.now();
  if (!forceRefresh && connection.tokenHealth?.status === "invalid") {
    return buildCloudflareConnectionStatus(connection, { now });
  }
  const statusAtNow = buildCloudflareConnectionStatus(connection, { now });
  const effectiveExpiresAt =
    connection.tokenHealth?.expiresAt ?? connection.auth.credentialExpiresAt;
  const nextAutoCheckAt = statusAtNow.mcpTokenNextAutoCheckAt;
  if (
    !forceRefresh &&
    connection.tokenHealth?.source === "runtime_error" &&
    typeof nextAutoCheckAt === "number" &&
    now < nextAutoCheckAt
  ) {
    return buildCloudflareConnectionStatus(connection, {
      now,
      nextAutoCheckAt,
    });
  }
  const refreshDueAt = effectiveExpiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS;

  if (!forceRefresh && now < refreshDueAt) {
    return buildCloudflareConnectionStatus(connection, {
      now,
      nextAutoCheckAt,
    });
  }

  const debounceMs =
    args.trigger === "page_load"
      ? CLOUDFLARE_TOKEN_REFRESH_PAGE_LOAD_DEBOUNCE_MS
      : CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS;
  const claim = await args.ctx.runMutation(
    internal.providerConnections.claimCloudflareTokenRefresh,
    {
      organizationId,
      providerConnectionId: connection._id,
      userId: args.userId,
      force: forceRefresh,
      debounceMs,
    },
  );
  if (!claim.claimed) {
    const refreshedConnection = await args.ctx.runQuery(
      internal.providerConnections.loadByIdForOrganization,
      {
        organizationId,
        userId: args.userId,
        providerConnectionId: connection._id,
        kind: "cloudflare",
      },
    );
    if (refreshedConnection?.kind !== "cloudflare") {
      return { connected: false } satisfies CloudflareConnectionStatus;
    }
    const nowAfterClaim = Date.now();
    if (refreshedConnection.auth.method !== "mcp_oauth") {
      return buildCloudflareConnectionStatus(refreshedConnection, {
        now: nowAfterClaim,
      });
    }
    return buildCloudflareConnectionStatus(refreshedConnection, {
      now: nowAfterClaim,
      nextAutoCheckAt:
        claim.nextAllowedRefreshAt ??
        computeCloudflareNextAutoCheckAt({
          expiresAt:
            refreshedConnection.tokenHealth?.expiresAt ??
            refreshedConnection.auth.credentialExpiresAt,
          now: nowAfterClaim,
        }),
    });
  }

  let shouldRecordLastTokenRefreshAt = false;
  try {
    const resolvedConnection = await args.ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForOrganization,
      {
        userId: args.userId,
        organizationId,
        providerConnectionId: connection._id,
        forceRefresh: true,
      },
    );
    if (resolvedConnection === null) {
      return { connected: false } satisfies CloudflareConnectionStatus;
    }
    shouldRecordLastTokenRefreshAt = true;
    const nowAfterRefresh = Date.now();
    if (resolvedConnection.auth.method !== "mcp_oauth") {
      return buildCloudflareConnectionStatus(resolvedConnection, {
        now: nowAfterRefresh,
      });
    }
    return buildCloudflareConnectionStatus(resolvedConnection, {
      now: nowAfterRefresh,
      nextAutoCheckAt: computeCloudflareNextAutoCheckAt({
        expiresAt:
          resolvedConnection.tokenHealth?.expiresAt ?? resolvedConnection.auth.credentialExpiresAt,
        now: nowAfterRefresh,
      }),
    });
  } catch {
    const refreshedConnection = await args.ctx.runQuery(
      internal.providerConnections.loadByIdForOrganization,
      {
        organizationId,
        userId: args.userId,
        providerConnectionId: connection._id,
        kind: "cloudflare",
      },
    );
    if (refreshedConnection?.kind === "cloudflare") {
      const nowAfterFailure = Date.now();
      const checkedAt = refreshedConnection.tokenHealth?.checkedAt;
      const retryDueAt =
        (checkedAt ?? nowAfterFailure) + computeCloudflareRetryDelayMs(checkedAt, nowAfterFailure);
      if (
        refreshedConnection.auth.method === "mcp_oauth" &&
        refreshedConnection.tokenHealth?.status === "invalid"
      ) {
        return buildCloudflareConnectionStatus(refreshedConnection, {
          now: nowAfterFailure,
        });
      }
      if (
        refreshedConnection.auth.method === "mcp_oauth" &&
        refreshedConnection.tokenHealth?.source === "runtime_error"
      ) {
        return buildCloudflareConnectionStatus(refreshedConnection, {
          now: nowAfterFailure,
          nextAutoCheckAt: retryDueAt,
        });
      }
      if (!forceRefresh) {
        return buildCloudflareConnectionStatus(refreshedConnection, {
          now: nowAfterFailure,
          nextAutoCheckAt: retryDueAt,
        });
      }
    }
    throw new Error("Cloudflare token refresh failed.");
  } finally {
    await args.ctx.runMutation(internal.providerConnections.releaseCloudflareTokenRefresh, {
      organizationId,
      providerConnectionId: connection._id,
      userId: args.userId,
      recordLastTokenRefreshAt: shouldRecordLastTokenRefreshAt,
    });
  }
}

export const refreshCloudflareMcpTokenIfNeeded = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    trigger: optional(vCloudflareAutoRefreshTrigger),
    force: optional(boolean()),
  },
  returns: vCloudflareConnectionStatus,
  handler: async (ctx, args) => {
    return await runCloudflareMcpTokenRefresh({
      ctx,
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
      trigger: args.trigger ?? "manual",
      force: args.force,
    });
  },
});

export const checkCloudflareMcpTokenHealth = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vCloudflareConnectionStatus,
  handler: async (ctx, args) => {
    return await runCloudflareMcpTokenRefresh({
      ctx,
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
      trigger: "manual",
      force: true,
    });
  },
});

export const disconnectCloudflare = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const connection = await ctx.runQuery(
      internal.providerConnections.loadSelectedForOrganization,
      { organizationId, userId: ctx.viewer.userId, kind: "cloudflare" },
    );
    if (connection?.kind === "cloudflare") {
      await ctx.runAction(internal.cloudflareOAuth.revokeCloudflareOAuthForOrganizationConnection, {
        organizationId,
        userId: ctx.viewer.userId,
        providerConnectionId: connection._id,
      });
      await ctx.runMutation(internal.providerConnections.disconnect, {
        organizationId,
        disconnectedByUserId: ctx.viewer.userId,
        providerConnectionId: connection._id,
        kind: "cloudflare",
      });
    }
    return null;
  },
});

const vConvexApiKeyConnectionResult = v.object({
  teamId: v.string(),
});

export const connectConvexWithApiKey = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    token: v.string(),
  },
  returns: vConvexApiKeyConnectionResult,
  handler: async (ctx, args): Promise<Infer<typeof vConvexApiKeyConnectionResult>> => {
    const token = normalizeApiToken(args.token);
    const details = await fetchConvexApiKeyTeamDetails(token);
    const organizationId: Id<"organizations"> = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const target: Doc<"providerConnections"> | null = await ctx.runQuery(
      internal.providerConnections.loadSelectedForOrganization,
      {
        organizationId,
        userId: ctx.viewer.userId,
        kind: "convex",
      },
    );
    const connection = {
      kind: "convex" as const,
      auth: {
        method: "api_key" as const,
        credential: token,
      },
      teamId: details.teamId,
    };
    if (target?.kind === "convex" && target.teamId === details.teamId) {
      await ctx.runMutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ctx.viewer.userId,
        providerConnectionId: target._id,
        connection,
      });
    } else {
      await ctx.runMutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ctx.viewer.userId,
        connection,
      });
    }

    return { teamId: details.teamId };
  },
});

// Internal
export const getAuthUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const getById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
