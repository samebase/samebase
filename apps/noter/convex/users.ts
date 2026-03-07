import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Infer, v } from "convex/values";
import { getConnectionByUserAndKind } from "./providerConnections";
import { isRecord, readBoolean, readString } from "./jsonUtils";
import {
  deriveMcpTokenStatusFromExpiry,
  mcpTokenHealthStatusValidator,
  type McpTokenHealth,
} from "./mcpTokenHealth";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_PAGE_LOAD_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS,
  CLOUDFLARE_TOKEN_REFRESH_UNKNOWN_EXPIRY_RECHECK_MS,
} from "../shared/cloudflareTokenRefresh";

const { array, boolean, literal, number, object, optional, string, union } = v;

const ADMIN_USERNAMES = ["nicu-chiciuc"];
const ADMIN_EMAILS = new Set([
  "nicu.dev@gmail.com",
  "nicuchiciuc@gmail.com",
  "nicu@noter.md",
]);
const ALLOWED_EMAILS = new Set([
  "nicu.dev@gmail.com",
  "nicuchiciuc@gmail.com",
  "nicu@noter.md",
]);
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const GITHUB_API_BASE = "https://api.github.com";
const CONVEX_TOKEN_DETAILS_URL = "https://api.convex.dev/v1/token_details";
const NETLIFY_API_BASE = "https://api.netlify.com/api/v1";

const authProviderSummaryValidator = object({
  providers: array(string()),
  primaryProvider: optional(string()),
});
type AuthProviderSummary = Infer<typeof authProviderSummaryValidator>;

const providerAuthMethodValidator = union(
  literal("oauth"),
  literal("mcp_oauth"),
  literal("api_key"),
);
const cloudflareConnectionStatusValidator = object({
  connected: boolean(),
  accountId: optional(string()),
  authMethod: optional(providerAuthMethodValidator),
  mcpTokenStatus: optional(mcpTokenHealthStatusValidator),
  mcpTokenExpiresAt: optional(number()),
  mcpTokenCheckedAt: optional(number()),
  mcpTokenError: optional(string()),
  mcpTokenRefreshStartedAt: optional(number()),
  mcpTokenLastRefreshAt: optional(number()),
  mcpTokenNextAutoCheckAt: optional(number()),
});
type CloudflareConnectionStatus = Infer<
  typeof cloudflareConnectionStatusValidator
>;
type CloudflareAuthMethod = Extract<
  Infer<typeof providerAuthMethodValidator>,
  "mcp_oauth" | "api_key"
>;
type CloudflareConnectionStatusInput = {
  accountId?: string;
  auth: {
    method: CloudflareAuthMethod;
    credentialExpiresAt?: number;
  };
  tokenHealth?: McpTokenHealth;
  tokenRefreshStartedAt?: number;
  lastTokenRefreshAt?: number;
};

type JsonRecord = Record<string, unknown>;
type NetlifyAccount = {
  id: string;
  slug?: string;
  type?: string;
  isDefault?: boolean;
};

function readNumberAsString(
  record: JsonRecord,
  key: string,
): string | undefined {
  const value = record[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readNestedString(
  record: JsonRecord,
  key: string,
  field: string,
): string | undefined {
  const nested = record[key];
  if (!isRecord(nested)) return undefined;
  return readNumberAsString(nested, field);
}

function resolveField(
  record: JsonRecord,
  keys: string[],
  nested?: { key: string; field: string },
): string | undefined {
  for (const key of keys) {
    const value = readNumberAsString(record, key);
    if (value !== undefined) return value;
  }
  if (!nested) {
    return undefined;
  }
  return readNestedString(record, nested.key, nested.field);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function isAdminUser(
  githubUsername: string | null | undefined,
  email?: string | null | undefined,
): boolean {
  if (githubUsername && ADMIN_USERNAMES.includes(githubUsername)) {
    return true;
  }
  if (!email) {
    return false;
  }
  return ADMIN_EMAILS.has(email.toLowerCase());
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return ALLOWED_EMAILS.has(email.toLowerCase());
}

function normalizeApiToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error("API key is required");
  }
  return normalized;
}

function computeCloudflareRefreshWindowStartAt(
  expiresAt: number | undefined,
): number | undefined {
  if (typeof expiresAt !== "number") {
    return undefined;
  }
  return expiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS;
}

function computeCloudflareNextAutoCheckAt(args: {
  expiresAt: number | undefined;
  now: number;
  lastTokenRefreshAt?: number;
  tokenCheckedAt?: number;
  fallbackIntervalMs?: number;
}): number {
  const refreshWindowStartAt = computeCloudflareRefreshWindowStartAt(
    args.expiresAt,
  );
  if (typeof refreshWindowStartAt === "number") {
    if (args.now < refreshWindowStartAt) {
      return refreshWindowStartAt;
    }
    const intervalMs =
      args.fallbackIntervalMs ?? CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS;
    return args.now + intervalMs;
  }

  const baseline = args.lastTokenRefreshAt ?? args.tokenCheckedAt ?? args.now;
  return baseline + CLOUDFLARE_TOKEN_REFRESH_UNKNOWN_EXPIRY_RECHECK_MS;
}

function computeCloudflareRetryDelayMs(
  previousCheckedAt: number | undefined,
  now: number,
): number {
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
): CloudflareConnectionStatus {
  const now = options?.now ?? Date.now();
  const baseStatus: CloudflareConnectionStatus = {
    connected: true,
    accountId: connection.accountId,
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
        : storedStatus ?? derivedStatus;
  const nextAutoCheckAt =
    mcpTokenStatus === "invalid"
      ? undefined
      : options?.nextAutoCheckAt ??
        computeCloudflareNextAutoCheckAt({
          expiresAt: effectiveExpiresAt,
          now,
          lastTokenRefreshAt: connection.lastTokenRefreshAt,
          tokenCheckedAt: connection.tokenHealth?.checkedAt,
        });
  return {
    ...baseStatus,
    mcpTokenStatus,
    mcpTokenExpiresAt: effectiveExpiresAt,
    mcpTokenCheckedAt: connection.tokenHealth?.checkedAt,
    mcpTokenError: connection.tokenHealth?.errorMessage,
    ...(typeof nextAutoCheckAt === "number"
      ? { mcpTokenNextAutoCheckAt: nextAutoCheckAt }
      : {}),
  };
}

async function fetchGithubIdentity(token: string): Promise<{
  username: string;
}> {
  const response = await fetchWithTimeout(`${GITHUB_API_BASE}/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "noter-app",
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    throw new Error("Invalid GitHub API key");
  }

  const username = readString(payload, "login");
  if (!username) {
    throw new Error("GitHub API key response is missing user login");
  }

  return { username };
}

async function fetchConvexTokenDetails(token: string): Promise<{
  teamId: string;
  teamSlug?: string;
}> {
  const response = await fetchWithTimeout(CONVEX_TOKEN_DETAILS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    throw new Error("Invalid Convex API key");
  }

  const teamId = resolveField(payload, ["teamId", "team_id"], {
    key: "team",
    field: "id",
  });
  if (!teamId) {
    throw new Error("Convex API key is missing team access");
  }

  const teamSlug = resolveField(payload, ["teamSlug", "team_slug"], {
    key: "team",
    field: "slug",
  });
  return { teamId, teamSlug };
}

async function fetchNetlifyConnectionDetails(token: string): Promise<{
  teamId: string;
  teamSlug?: string;
}> {
  const userResponse = await fetchWithTimeout(`${NETLIFY_API_BASE}/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const userPayload = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !isRecord(userPayload)) {
    throw new Error("Invalid Netlify API key");
  }

  const accountsResponse = await fetchWithTimeout(
    `${NETLIFY_API_BASE}/accounts`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const accountsPayload = await accountsResponse.json().catch(() => null);
  if (!accountsResponse.ok || !Array.isArray(accountsPayload)) {
    throw new Error("Unable to list Netlify teams for this API key");
  }

  const accounts: NetlifyAccount[] = [];
  for (const account of accountsPayload) {
    if (!isRecord(account)) {
      continue;
    }
    const id = readString(account, "id");
    if (!id) {
      continue;
    }
    const isDefault =
      readBoolean(account, "is_default") ??
      readBoolean(account, "isDefault") ??
      readBoolean(account, "default");
    accounts.push({
      id,
      slug: readString(account, "slug"),
      type: readString(account, "type"),
      isDefault,
    });
  }

  if (accounts.length === 0) {
    throw new Error("No Netlify team/account found for this API key");
  }

  const defaultAccount = accounts.find((account) => account.isDefault);
  const teamAccount = accounts.find((account) => account.type === "team");
  const selectedAccount = defaultAccount ?? teamAccount ?? accounts[0];

  return {
    teamId: selectedAccount.id,
    teamSlug: selectedAccount.slug,
  };
}

// Public

export const viewer = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      githubUsername: v.optional(v.string()),
      hasGithubConnection: boolean(),
      hasConvexConnection: boolean(),
      hasNetlifyConnection: boolean(),
      hasCloudflareConnection: boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    const [github, convex, netlify, cloudflare] = await Promise.all([
      getConnectionByUserAndKind(ctx.db, userId, "github"),
      getConnectionByUserAndKind(ctx.db, userId, "convex"),
      getConnectionByUserAndKind(ctx.db, userId, "netlify"),
      getConnectionByUserAndKind(ctx.db, userId, "cloudflare"),
    ]);

    const githubUsername =
      github?.kind === "github" ? github.username : undefined;

    return {
      _id: user._id,
      name: user.name,
      image: user.image,
      email: user.email,
      githubUsername,
      hasGithubConnection: github !== null,
      hasConvexConnection: convex !== null,
      hasNetlifyConnection: netlify !== null,
      hasCloudflareConnection: cloudflare !== null,
    };
  },
});

export const getViewerAuthProviders = query({
  args: {},
  returns: authProviderSummaryValidator,
  handler: async (ctx): Promise<AuthProviderSummary> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { providers: [] };
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const providers: string[] = [];
    const seen = new Set<string>();
    for (const account of accounts) {
      if (seen.has(account.provider)) {
        continue;
      }
      seen.add(account.provider);
      providers.push(account.provider);
    }

    const primaryProvider = accounts[0]?.provider;
    if (primaryProvider) {
      return { providers, primaryProvider };
    }
    return { providers };
  },
});

export const isCurrentUserApproved = query({
  args: {},
  returns: boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    if (!user) return false;

    const githubConnection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "github",
    );
    const githubUsername =
      githubConnection?.kind === "github"
        ? githubConnection.username
        : undefined;

    if (user.isApproved === true) return true;
    if (isAdminUser(githubUsername, user.email)) return true;
    if (isAllowedEmail(user.email)) return true;
    return false;
  },
});

export const getGithubConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: boolean(),
    username: v.optional(v.string()),
    authMethod: v.optional(providerAuthMethodValidator),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "github",
    );
    if (connection?.kind !== "github") {
      return { connected: false };
    }

    return {
      connected: true,
      username: connection.username,
      authMethod: connection.auth.method,
    };
  },
});

export const disconnectGithub = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }

    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "github",
    );
    if (connection) {
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

export const getConvexConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: boolean(),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
    authMethod: v.optional(providerAuthMethodValidator),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "convex",
    );
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

export const disconnectConvex = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "convex",
    );
    if (connection) {
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

export const getNetlifyConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: boolean(),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
    authMethod: v.optional(providerAuthMethodValidator),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "netlify",
    );
    if (connection?.kind !== "netlify") {
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

export const disconnectNetlify = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "netlify",
    );
    if (connection) {
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

export const getCloudflareConnectionStatus = query({
  args: {},
  returns: cloudflareConnectionStatusValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "cloudflare",
    );
    if (connection?.kind !== "cloudflare") {
      return { connected: false };
    }

    return buildCloudflareConnectionStatus(connection);
  },
});

const cloudflareAutoRefreshTriggerValidator = union(
  literal("focus"),
  literal("page_load"),
  literal("poll"),
  literal("manual"),
);
type CloudflareAutoRefreshTrigger = Infer<
  typeof cloudflareAutoRefreshTriggerValidator
>;

async function runCloudflareMcpTokenRefresh(args: {
  ctx: ActionCtx;
  trigger: CloudflareAutoRefreshTrigger;
  force?: boolean;
}): Promise<CloudflareConnectionStatus> {
  const userId = await getAuthUserId(args.ctx);
  if (userId === null) {
    throw new Error("User not authenticated");
  }

  const connection = await args.ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "cloudflare",
    },
  );
  if (connection?.kind !== "cloudflare") {
    throw new Error("Cloudflare is not connected");
  }
  if (connection.auth.method !== "mcp_oauth") {
    return buildCloudflareConnectionStatus(connection);
  }

  const forceRefresh = args.force === true || args.trigger === "manual";
  const now = Date.now();
  if (!forceRefresh && connection.tokenHealth?.status === "invalid") {
    return buildCloudflareConnectionStatus(connection, { now });
  }
  const effectiveExpiresAt =
    connection.tokenHealth?.expiresAt ?? connection.auth.credentialExpiresAt;
  const nextAutoCheckAt = computeCloudflareNextAutoCheckAt({
    expiresAt: effectiveExpiresAt,
    now,
    lastTokenRefreshAt: connection.lastTokenRefreshAt,
    tokenCheckedAt: connection.tokenHealth?.checkedAt,
  });
  const refreshDueAt =
    computeCloudflareRefreshWindowStartAt(effectiveExpiresAt);

  if (!forceRefresh && typeof refreshDueAt === "number" && now < refreshDueAt) {
    return buildCloudflareConnectionStatus(connection, {
      now,
      nextAutoCheckAt,
    });
  }

  if (
    !forceRefresh &&
    typeof refreshDueAt !== "number" &&
    now < nextAutoCheckAt
  ) {
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
      userId,
      force: forceRefresh,
      debounceMs,
    },
  );
  if (!claim.claimed) {
    const refreshedConnection = await args.ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "cloudflare",
      },
    );
    if (refreshedConnection?.kind !== "cloudflare") {
      return { connected: false };
    }
    const nowAfterClaim = Date.now();
    return buildCloudflareConnectionStatus(refreshedConnection, {
      now: nowAfterClaim,
      nextAutoCheckAt:
        claim.nextAllowedRefreshAt ??
        computeCloudflareNextAutoCheckAt({
          expiresAt:
            refreshedConnection.tokenHealth?.expiresAt ??
            refreshedConnection.auth.credentialExpiresAt,
          now: nowAfterClaim,
          lastTokenRefreshAt: refreshedConnection.lastTokenRefreshAt,
          tokenCheckedAt: refreshedConnection.tokenHealth?.checkedAt,
        }),
    });
  }

  let shouldRecordLastTokenRefreshAt = false;
  try {
    const resolvedConnection = await args.ctx.runAction(
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId,
        forceRefresh: true,
      },
    );
    if (resolvedConnection === null) {
      return { connected: false };
    }
    shouldRecordLastTokenRefreshAt = true;
    const nowAfterRefresh = Date.now();
    return buildCloudflareConnectionStatus(resolvedConnection, {
      now: nowAfterRefresh,
      nextAutoCheckAt: computeCloudflareNextAutoCheckAt({
        expiresAt:
          resolvedConnection.tokenHealth?.expiresAt ??
          resolvedConnection.auth.credentialExpiresAt,
        now: nowAfterRefresh,
        lastTokenRefreshAt: nowAfterRefresh,
        tokenCheckedAt: resolvedConnection.tokenHealth?.checkedAt,
      }),
    });
  } catch (error) {
    const refreshedConnection = await args.ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "cloudflare",
      },
    );
    if (refreshedConnection?.kind === "cloudflare") {
      const nowAfterFailure = Date.now();
      const retryDelayMs = computeCloudflareRetryDelayMs(
        refreshedConnection.tokenHealth?.checkedAt,
        nowAfterFailure,
      );
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
          nextAutoCheckAt: nowAfterFailure + retryDelayMs,
        });
      }
      if (!forceRefresh) {
        return buildCloudflareConnectionStatus(refreshedConnection, {
          now: nowAfterFailure,
          nextAutoCheckAt: nowAfterFailure + retryDelayMs,
        });
      }
    }
    throw error;
  } finally {
    await args.ctx.runMutation(
      internal.providerConnections.releaseCloudflareTokenRefresh,
      {
        userId,
        recordLastTokenRefreshAt: shouldRecordLastTokenRefreshAt,
      },
    );
  }
}

export const refreshCloudflareMcpTokenIfNeeded = action({
  args: {
    trigger: optional(cloudflareAutoRefreshTriggerValidator),
    force: optional(boolean()),
  },
  returns: cloudflareConnectionStatusValidator,
  handler: async (ctx, args): Promise<CloudflareConnectionStatus> => {
    return await runCloudflareMcpTokenRefresh({
      ctx,
      trigger: args.trigger ?? "manual",
      force: args.force,
    });
  },
});

export const checkCloudflareMcpTokenHealth = action({
  args: {},
  returns: cloudflareConnectionStatusValidator,
  handler: async (ctx): Promise<CloudflareConnectionStatus> => {
    return await runCloudflareMcpTokenRefresh({
      ctx,
      trigger: "manual",
      force: true,
    });
  },
});

export const disconnectCloudflare = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      userId,
      "cloudflare",
    );
    if (connection) {
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

const githubApiKeyConnectionResultValidator = v.object({
  username: v.string(),
});
type GithubApiKeyConnectionResult = Infer<
  typeof githubApiKeyConnectionResultValidator
>;

const convexApiKeyConnectionResultValidator = v.object({
  teamId: v.string(),
  teamSlug: v.optional(v.string()),
});
type ConvexApiKeyConnectionResult = Infer<
  typeof convexApiKeyConnectionResultValidator
>;

const netlifyApiKeyConnectionResultValidator = v.object({
  teamId: v.string(),
  teamSlug: v.optional(v.string()),
});
type NetlifyApiKeyConnectionResult = Infer<
  typeof netlifyApiKeyConnectionResultValidator
>;

export const connectGithubWithApiKey = action({
  args: {
    token: v.string(),
  },
  returns: githubApiKeyConnectionResultValidator,
  handler: async (ctx, args): Promise<GithubApiKeyConnectionResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }

    const token = normalizeApiToken(args.token);
    const identity = await fetchGithubIdentity(token);

    await ctx.runMutation(internal.providerConnections.upsertGithub, {
      userId,
      auth: {
        method: "api_key",
        credential: token,
      },
      username: identity.username,
    });

    return { username: identity.username };
  },
});

export const connectConvexWithApiKey = action({
  args: {
    token: v.string(),
  },
  returns: convexApiKeyConnectionResultValidator,
  handler: async (ctx, args): Promise<ConvexApiKeyConnectionResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }

    const token = normalizeApiToken(args.token);
    const details = await fetchConvexTokenDetails(token);

    await ctx.runMutation(internal.providerConnections.upsertConvex, {
      userId,
      auth: {
        method: "api_key",
        credential: token,
      },
      teamId: details.teamId,
      teamSlug: details.teamSlug,
    });

    return { teamId: details.teamId, teamSlug: details.teamSlug };
  },
});

export const connectNetlifyWithApiKey = action({
  args: {
    token: v.string(),
  },
  returns: netlifyApiKeyConnectionResultValidator,
  handler: async (ctx, args): Promise<NetlifyApiKeyConnectionResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }

    const token = normalizeApiToken(args.token);
    const details = await fetchNetlifyConnectionDetails(token);

    await ctx.runMutation(internal.providerConnections.upsertNetlify, {
      userId,
      auth: {
        method: "api_key",
        credential: token,
      },
      teamId: details.teamId,
      teamSlug: details.teamSlug,
    });

    return { teamId: details.teamId, teamSlug: details.teamSlug };
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
