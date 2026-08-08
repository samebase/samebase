import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, type ActionCtx, type DatabaseReader } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ConvexError, Infer, v } from "convex/values";
import { vViewerAccess, vViewerRoleResult } from "./accessModelValidators";
import { requireOrganizationMembership } from "./organizationAccess";
import { action, mutation, query } from "./functions";
import { fetchConvexTeamTokenDetails } from "./convexManagementApi/client";
import { ConvexManagementApiError } from "./convexManagementApi/errors";
import type { CloudflareAccount } from "./cloudflareAccountDiscovery";
import { deriveMcpTokenStatusFromExpiry, vMcpTokenHealthStatus } from "./mcpTokenHealth";
import type { CloudflareProviderCredential } from "./organizationProviderCredentialModel";
import {
  getOrganizationProviderConfiguration,
  type OrganizationProviderConfiguration,
} from "./organizationProviderCredentials";
import { hashOrganizationProviderSnapshot } from "./providerAuthFingerprint";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_PAGE_LOAD_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS,
} from "../shared/cloudflareTokenRefresh";
import type { AuthTokenAuthProvider } from "../shared/authTokenClaims";
import {
  type AccountPresentation,
  normalizeAccountEmail,
  normalizeDisplayName,
  resolveAccountPresentation,
  vAccountPresentation,
} from "../shared/accountPresentation";

const { array, boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

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

const vConvexProviderAuthMethod = union(literal("oauth"), literal("api_key"));
const vCloudflareProviderAuthMethod = union(
  literal("oauth"),
  literal("mcp_oauth"),
  literal("api_key"),
);
const vConvexConnectionStatus = union(
  object({ state: literal("not_configured") }),
  object({
    state: literal("disconnected"),
    teamId: string(),
    teamSlug: optional(string()),
  }),
  object({
    state: literal("connected"),
    teamId: string(),
    teamSlug: optional(string()),
    authMethod: vConvexProviderAuthMethod,
    connectedBy: optional(vAccountPresentation),
  }),
);
const cloudflareCredentialStatusFields = {
  authMethod: vCloudflareProviderAuthMethod,
  mcpTokenStatus: optional(vMcpTokenHealthStatus),
  mcpTokenExpiresAt: optional(number()),
  mcpTokenCheckedAt: optional(number()),
  mcpTokenRefreshStartedAt: optional(number()),
  mcpTokenLastRefreshAt: optional(number()),
  mcpTokenNextAutoCheckAt: optional(number()),
};
const vCloudflareNotConfiguredConnectionStatus = object({
  state: literal("not_configured"),
});
const vCloudflareDisconnectedConnectionStatus = object({
  state: literal("disconnected"),
  accountId: string(),
  accountName: string(),
});
const vCloudflareConnectedConnectionStatus = object({
  state: literal("connected"),
  accountId: string(),
  accountName: string(),
  ...cloudflareCredentialStatusFields,
  connectedBy: optional(vAccountPresentation),
});
const vCloudflareConnectionStatus = union(
  vCloudflareNotConfiguredConnectionStatus,
  vCloudflareDisconnectedConnectionStatus,
  vCloudflareConnectedConnectionStatus,
);
type CloudflareConnectionStatus = Infer<typeof vCloudflareConnectionStatus>;

async function readProviderConnectorPresentation(
  db: DatabaseReader,
  connectedByUserId: Id<"users">,
  viewerUserId: Id<"users">,
): Promise<AccountPresentation | undefined> {
  const user = await db.get(connectedByUserId);
  if (user === null || user.accountDeletion !== undefined) {
    return undefined;
  }
  const accountPresentation = resolveAccountPresentation(user);
  if (connectedByUserId !== viewerUserId && accountPresentation.kind === "email") {
    return undefined;
  }
  return accountPresentation;
}

function normalizeApiToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new ConvexError("API key is required");
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
  configuration: Pick<
    OrganizationProviderConfiguration,
    "cloudflareAccount" | "cloudflareCredential"
  >,
  options?: {
    now?: number;
    nextAutoCheckAt?: number;
  },
): CloudflareConnectionStatus {
  const account = configuration.cloudflareAccount;
  const credential = configuration.cloudflareCredential;
  if (credential === undefined) {
    return account === undefined
      ? { state: "not_configured" }
      : { state: "disconnected", ...account };
  }
  if (account === undefined) {
    throw new Error("Cloudflare credential has no configured account.");
  }

  const now = options?.now ?? Date.now();
  const credentialStatus = {
    authMethod: credential.auth.method,
    ...(credential.tokenRefreshLease
      ? { mcpTokenRefreshStartedAt: credential.tokenRefreshLease.startedAt }
      : {}),
    ...(credential.lastTokenRefreshAt
      ? { mcpTokenLastRefreshAt: credential.lastTokenRefreshAt }
      : {}),
  };

  if (credential.auth.method !== "mcp_oauth") {
    return { state: "connected", ...account, ...credentialStatus };
  }

  const effectiveExpiresAt =
    credential.tokenHealth?.expiresAt ?? credential.auth.credentialExpiresAt;
  const derivedStatus = deriveMcpTokenStatusFromExpiry(effectiveExpiresAt, now);
  const storedStatus = credential.tokenHealth?.status;
  const shouldUseDerivedStatus =
    credential.tokenHealth?.checkedAt === undefined ||
    derivedStatus === "expired" ||
    derivedStatus === "expiring_soon";
  const mcpTokenStatus =
    storedStatus === "invalid"
      ? "invalid"
      : shouldUseDerivedStatus
        ? derivedStatus
        : (storedStatus ?? derivedStatus);
  const runtimeErrorCheckedAt = credential.tokenHealth?.checkedAt;
  const derivedNextAutoCheckAt =
    credential.tokenHealth?.source === "runtime_error"
      ? (runtimeErrorCheckedAt ?? now) + computeCloudflareRetryDelayMs(runtimeErrorCheckedAt, now)
      : computeCloudflareNextAutoCheckAt({
          expiresAt: effectiveExpiresAt,
          now,
        });
  const nextAutoCheckAt =
    mcpTokenStatus === "invalid" ? undefined : (options?.nextAutoCheckAt ?? derivedNextAutoCheckAt);
  const mcpStatus = {
    ...credentialStatus,
    mcpTokenStatus,
    mcpTokenExpiresAt: effectiveExpiresAt,
    ...(credential.tokenHealth?.checkedAt
      ? { mcpTokenCheckedAt: credential.tokenHealth.checkedAt }
      : {}),
    ...(typeof nextAutoCheckAt === "number" ? { mcpTokenNextAutoCheckAt: nextAutoCheckAt } : {}),
  };
  return { state: "connected", ...account, ...mcpStatus };
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
      throw new ConvexError("Invalid Convex API key");
    }
    if (error instanceof ConvexManagementApiError) {
      throw new ConvexError(`Convex API key check failed (${error.status}).`);
    }
    throw new ConvexError("Convex API key check failed.");
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
  returns: vConvexConnectionStatus,
  handler: async (ctx, args): Promise<Infer<typeof vConvexConnectionStatus>> => {
    const membership = await requireOrganizationMembership(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const configuration = await getOrganizationProviderConfiguration(
      ctx.db,
      membership.organizationId,
    );
    if (configuration.convexTeam === undefined) {
      if (configuration.convexCredential !== undefined) {
        throw new Error("Convex credential has no configured team.");
      }
      return { state: "not_configured" };
    }
    if (configuration.convexCredential === undefined) {
      return { state: "disconnected", ...configuration.convexTeam };
    }
    const connectedBy =
      membership.role === "owner" && configuration.convexCredential.auth.method === "oauth"
        ? await readProviderConnectorPresentation(
            ctx.db,
            configuration.convexCredential.connectedByUserId,
            ctx.viewer.userId,
          )
        : undefined;
    return {
      state: "connected",
      ...configuration.convexTeam,
      authMethod: configuration.convexCredential.auth.method,
      ...(connectedBy ? { connectedBy } : {}),
    };
  },
});

export const disconnectConvex = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    if (configuration.convexCredential === undefined) {
      return null;
    }
    await ctx.runMutation(internal.organizationProviderCredentials.disconnectConvex, {
      organizationId,
      disconnectedByUserId: ctx.viewer.userId,
      expectedAuth: configuration.convexCredential.auth,
    });
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
    const membership = await requireOrganizationMembership(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const configuration = await getOrganizationProviderConfiguration(
      ctx.db,
      membership.organizationId,
    );
    const status = buildCloudflareConnectionStatus(configuration);
    const credential = configuration.cloudflareCredential;
    if (
      membership.role !== "owner" ||
      status.state !== "connected" ||
      credential === undefined ||
      credential.auth.method === "api_key"
    ) {
      return status;
    }
    const connectedBy = await readProviderConnectorPresentation(
      ctx.db,
      credential.connectedByUserId,
      ctx.viewer.userId,
    );
    return connectedBy ? { ...status, connectedBy } : status;
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
  const configuration = await args.ctx.runQuery(
    internal.organizationProviderCredentials.loadForOrganization,
    { organizationId, userId: args.userId },
  );
  const credential = configuration.cloudflareCredential;
  if (credential === undefined) {
    return buildCloudflareConnectionStatus(configuration);
  }
  if (credential.auth.method !== "mcp_oauth") {
    return buildCloudflareConnectionStatus(configuration);
  }

  const forceRefresh = args.force === true || args.trigger === "manual";
  const now = Date.now();
  if (!forceRefresh && credential.tokenHealth?.status === "invalid") {
    return buildCloudflareConnectionStatus(configuration, { now });
  }
  const statusAtNow = buildCloudflareConnectionStatus(configuration, { now });
  const effectiveExpiresAt =
    credential.tokenHealth?.expiresAt ?? credential.auth.credentialExpiresAt;
  const nextAutoCheckAt =
    statusAtNow.state === "connected" ? statusAtNow.mcpTokenNextAutoCheckAt : undefined;
  if (
    !forceRefresh &&
    credential.tokenHealth?.source === "runtime_error" &&
    typeof nextAutoCheckAt === "number" &&
    now < nextAutoCheckAt
  ) {
    return buildCloudflareConnectionStatus(configuration, {
      now,
      nextAutoCheckAt,
    });
  }
  const refreshDueAt = effectiveExpiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS;

  if (!forceRefresh && now < refreshDueAt) {
    return buildCloudflareConnectionStatus(configuration, {
      now,
      nextAutoCheckAt,
    });
  }

  const debounceMs =
    args.trigger === "page_load"
      ? CLOUDFLARE_TOKEN_REFRESH_PAGE_LOAD_DEBOUNCE_MS
      : CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS;
  const claim = await args.ctx.runMutation(
    internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
    {
      organizationId,
      userId: args.userId,
      expectedAuth: credential.auth,
      force: forceRefresh,
      debounceMs,
    },
  );
  if (!claim.claimed) {
    const refreshedConfiguration = await args.ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      {
        organizationId,
        userId: args.userId,
      },
    );
    const nowAfterClaim = Date.now();
    const refreshedCredential = refreshedConfiguration.cloudflareCredential;
    if (refreshedCredential?.auth.method !== "mcp_oauth") {
      return buildCloudflareConnectionStatus(refreshedConfiguration, {
        now: nowAfterClaim,
      });
    }
    return buildCloudflareConnectionStatus(refreshedConfiguration, {
      now: nowAfterClaim,
      nextAutoCheckAt:
        claim.nextAllowedRefreshAt ??
        computeCloudflareNextAutoCheckAt({
          expiresAt:
            refreshedCredential.tokenHealth?.expiresAt ??
            refreshedCredential.auth.credentialExpiresAt,
          now: nowAfterClaim,
        }),
    });
  }
  const refreshLease = claim.tokenRefreshLease;

  let releaseExpectedAuth: CloudflareProviderCredential["auth"] = credential.auth;
  let shouldRecordLastTokenRefreshAt = false;
  try {
    const resolvedConnection = await args.ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForOrganization,
      {
        userId: args.userId,
        organizationId,
        forceRefresh: true,
        refreshLease: {
          auth: credential.auth,
          tokenRefreshLease: refreshLease,
        },
      },
    );
    if (resolvedConnection === null) {
      const current = await args.ctx.runQuery(
        internal.organizationProviderCredentials.loadForOrganization,
        { organizationId, userId: args.userId },
      );
      return buildCloudflareConnectionStatus(current);
    }
    releaseExpectedAuth = resolvedConnection.auth;
    shouldRecordLastTokenRefreshAt = true;
    const nowAfterRefresh = Date.now();
    const refreshedConfiguration = await args.ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: args.userId },
    );
    return buildCloudflareConnectionStatus(refreshedConfiguration, {
      now: nowAfterRefresh,
      ...(resolvedConnection.auth.method === "mcp_oauth"
        ? {
            nextAutoCheckAt: computeCloudflareNextAutoCheckAt({
              expiresAt:
                resolvedConnection.tokenHealth?.expiresAt ??
                resolvedConnection.auth.credentialExpiresAt,
              now: nowAfterRefresh,
            }),
          }
        : {}),
    });
  } catch {
    const refreshedConfiguration = await args.ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      {
        organizationId,
        userId: args.userId,
      },
    );
    const refreshedCredential = refreshedConfiguration.cloudflareCredential;
    if (refreshedCredential !== undefined) {
      const nowAfterFailure = Date.now();
      const checkedAt = refreshedCredential.tokenHealth?.checkedAt;
      const retryDueAt =
        (checkedAt ?? nowAfterFailure) + computeCloudflareRetryDelayMs(checkedAt, nowAfterFailure);
      if (
        refreshedCredential.auth.method === "mcp_oauth" &&
        refreshedCredential.tokenHealth?.status === "invalid"
      ) {
        return buildCloudflareConnectionStatus(refreshedConfiguration, {
          now: nowAfterFailure,
        });
      }
      if (
        refreshedCredential.auth.method === "mcp_oauth" &&
        refreshedCredential.tokenHealth?.source === "runtime_error"
      ) {
        return buildCloudflareConnectionStatus(refreshedConfiguration, {
          now: nowAfterFailure,
          nextAutoCheckAt: retryDueAt,
        });
      }
      if (!forceRefresh) {
        return buildCloudflareConnectionStatus(refreshedConfiguration, {
          now: nowAfterFailure,
          nextAutoCheckAt: retryDueAt,
        });
      }
    }
    throw new Error("Cloudflare token refresh failed.");
  } finally {
    await args.ctx.runMutation(
      internal.organizationProviderCredentials.releaseCloudflareTokenRefresh,
      {
        organizationId,
        expectedAuth: releaseExpectedAuth,
        expectedTokenRefreshLease: refreshLease,
        recordLastTokenRefreshAt: shouldRecordLastTokenRefreshAt,
      },
    );
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
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    if (configuration.cloudflareCredential === undefined) {
      return null;
    }
    await ctx.runMutation(internal.organizationProviderCredentials.disconnectCloudflare, {
      organizationId,
      disconnectedByUserId: ctx.viewer.userId,
      expectedAuth: configuration.cloudflareCredential.auth,
    });
    return null;
  },
});

export const connectCloudflareWithApiToken = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    token: string(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError("Cloudflare API token is required.");
    }

    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    const expectedProviderSnapshotHash = await hashOrganizationProviderSnapshot({
      provider: "cloudflare",
      accountId: configuration.cloudflareAccount?.accountId,
      credential: configuration.cloudflareCredential,
    });

    let accounts: CloudflareAccount[];
    try {
      accounts = await ctx.runAction(
        internal.cloudflareAccountDiscovery.listAccountsForUserApiToken,
        { token },
      );
    } catch {
      throw new ConvexError("Cloudflare API token check failed.");
    }
    if (accounts.length === 0) {
      throw new ConvexError("Cloudflare API token cannot access an account.");
    }
    if (accounts.length > 1) {
      throw new ConvexError("Use a Cloudflare API token that can access ONLY ONE account.");
    }

    const configuredAccount = configuration.cloudflareAccount;
    const [account] = accounts;
    if (configuredAccount !== undefined && account.accountId !== configuredAccount.accountId) {
      throw new ConvexError(
        `Use a Cloudflare API token that can access ONLY ${configuredAccount.accountName}.`,
      );
    }

    await ctx.runMutation(internal.organizationProviderCredentials.connectCloudflare, {
      organizationId,
      connectedByUserId: ctx.viewer.userId,
      expectedProviderSnapshotHash,
      auth: {
        method: "api_key",
        credential: token,
      },
      account,
    });
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
    const organizationId: Id<"organizations"> = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const token = normalizeApiToken(args.token);
    const details = await fetchConvexApiKeyTeamDetails(token);
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      {
        organizationId,
        userId: ctx.viewer.userId,
      },
    );
    const configuredTeam = configuration.convexTeam;
    if (configuredTeam !== undefined && configuredTeam.teamId !== details.teamId) {
      throw new ConvexError("Convex API key cannot access the configured Convex team.");
    }

    const expectedProviderSnapshotHash = await hashOrganizationProviderSnapshot({
      provider: "convex",
      teamId: configuredTeam?.teamId,
      credential: configuration.convexCredential,
    });
    await ctx.runMutation(internal.organizationProviderCredentials.connectConvex, {
      organizationId,
      connectedByUserId: ctx.viewer.userId,
      expectedProviderSnapshotHash,
      auth: {
        method: "api_key" as const,
        credential: token,
      },
      teamId: details.teamId,
    });

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
