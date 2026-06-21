import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { Infer, v } from "convex/values";
import { vViewerAccess, vViewerRoleResult } from "./accessModelValidators";
import { getConnectionByUserAndKind } from "./providerConnections";
import { action, mutation, query } from "./functions";
import { isRecord, readString } from "./jsonUtils";
import { readOptionalEnv } from "./oauthUtils";
import { fetchConvexTeamTokenDetails } from "./convexManagementApi/client";
import { ConvexManagementApiError } from "./convexManagementApi/errors";
import {
  deriveMcpTokenStatusFromExpiry,
  vMcpTokenHealthStatus,
  type McpTokenHealth,
} from "./mcpTokenHealth";
import type { CloudflareDefaultAccount } from "./schema";
import { buildGitHubOAuthManageUrl, getGitHubOAuthScopeRequirements } from "../shared/githubOAuth";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_PAGE_LOAD_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS,
  CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS,
} from "../shared/cloudflareTokenRefresh";

const { array, boolean, literal, number, object, optional, string, union } = v;

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const GITHUB_API_BASE = "https://api.github.com";

const authProviderSummaryValidator = object({
  providers: array(string()),
  primaryProvider: optional(string()),
});

type AuthProviderAccountSummary = {
  _creationTime: number;
  _id: string;
  provider: string;
};

const providerAuthMethodValidator = union(
  literal("oauth"),
  literal("mcp_oauth"),
  literal("api_key"),
);
const githubOAuthScopeRequirementValidator = object({
  scope: string(),
  label: string(),
});
const githubScopeStatusValidator = union(
  literal("granted"),
  literal("missing"),
  literal("unknown"),
);
const githubRequiredScopeHealthValidator = object({
  scope: string(),
  label: string(),
  status: githubScopeStatusValidator,
});
const githubProviderSummaryValidator = object({
  connected: boolean(),
  username: optional(string()),
  authMethod: optional(providerAuthMethodValidator),
  requiredScopes: array(githubOAuthScopeRequirementValidator),
  manageUrl: optional(string()),
  reauthorizeAvailable: boolean(),
});
const githubHealthCheckKeyValidator = union(literal("profile"), literal("repositories"));
const githubHealthCheckStatusValidator = union(literal("ok"), literal("error"), literal("unknown"));
const githubHealthCheckValidator = object({
  key: githubHealthCheckKeyValidator,
  label: string(),
  status: githubHealthCheckStatusValidator,
  message: optional(string()),
});
const githubConnectionHealthValidator = object({
  connected: boolean(),
  username: optional(string()),
  authMethod: optional(providerAuthMethodValidator),
  checkedAt: number(),
  grantedScopes: array(string()),
  requiredScopes: array(githubRequiredScopeHealthValidator),
  checks: array(githubHealthCheckValidator),
  manageUrl: optional(string()),
  reauthorizeAvailable: boolean(),
});
const cloudflareConnectionStatusValidator = object({
  connected: boolean(),
  accountId: optional(string()),
  accountName: optional(string()),
  authMethod: optional(providerAuthMethodValidator),
  mcpTokenStatus: optional(vMcpTokenHealthStatus),
  mcpTokenExpiresAt: optional(number()),
  mcpTokenCheckedAt: optional(number()),
  mcpTokenError: optional(string()),
  mcpTokenRefreshStartedAt: optional(number()),
  mcpTokenLastRefreshAt: optional(number()),
  mcpTokenNextAutoCheckAt: optional(number()),
});
type CloudflareConnectionStatus = Infer<typeof cloudflareConnectionStatusValidator>;
type GithubProviderSummary = Infer<typeof githubProviderSummaryValidator>;
type GithubConnectionHealth = Infer<typeof githubConnectionHealthValidator>;
type CloudflareConnectionStatusInput = {
  defaultAccount: CloudflareDefaultAccount;
  auth:
    | {
        method: "api_key";
      }
    | {
        method: "mcp_oauth";
        credentialExpiresAt: number;
      };
  tokenHealth?: McpTokenHealth;
  tokenRefreshStartedAt?: number;
  lastTokenRefreshAt?: number;
};

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

function normalizeApiToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error("API key is required");
  }
  return normalized;
}

function getGithubOAuthManageUrl(): string | undefined {
  const clientId = readOptionalEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID");
  if (!clientId) {
    return undefined;
  }
  return buildGitHubOAuthManageUrl(clientId);
}

function buildGithubProviderSummary(
  connection: Awaited<ReturnType<typeof getConnectionByUserAndKind>>,
): GithubProviderSummary {
  const requiredScopes = getGitHubOAuthScopeRequirements();
  if (connection?.kind !== "github") {
    return {
      connected: false,
      requiredScopes,
      reauthorizeAvailable: false,
    };
  }

  const manageUrl = connection.auth.method === "oauth" ? getGithubOAuthManageUrl() : undefined;
  return {
    connected: true,
    username: connection.username,
    authMethod: connection.auth.method,
    requiredScopes,
    ...(manageUrl ? { manageUrl } : {}),
    reauthorizeAvailable: connection.auth.method === "oauth" && manageUrl !== undefined,
  };
}

export function parseGitHubOAuthScopesHeader(header: string | null | undefined): string[] {
  if (!header) {
    return [];
  }

  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const rawScope of header.split(",")) {
    const scope = rawScope.trim();
    if (!scope || seen.has(scope)) {
      continue;
    }
    seen.add(scope);
    scopes.push(scope);
  }
  return scopes;
}

function mergeGithubScopes(first: readonly string[], second: readonly string[]): string[] {
  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const scope of [...first, ...second]) {
    if (seen.has(scope)) {
      continue;
    }
    seen.add(scope);
    scopes.push(scope);
  }
  return scopes;
}

function isGitHubOAuthScopeGranted(scope: string, grantedScopes: Set<string>): boolean {
  if (scope === "user:email") {
    return grantedScopes.has("user:email") || grantedScopes.has("user");
  }
  return grantedScopes.has(scope);
}

export function buildGithubRequiredScopeHealth(args: {
  authMethod: "oauth" | "api_key";
  grantedScopes: readonly string[];
}): GithubConnectionHealth["requiredScopes"] {
  const grantedScopeSet = new Set(args.grantedScopes);
  const hasReportedScopes = args.grantedScopes.length > 0;
  return getGitHubOAuthScopeRequirements().map((scopeRequirement) => ({
    ...scopeRequirement,
    status: hasReportedScopes
      ? isGitHubOAuthScopeGranted(scopeRequirement.scope, grantedScopeSet)
        ? "granted"
        : "missing"
      : args.authMethod === "oauth"
        ? "missing"
        : "unknown",
  }));
}

function formatGithubHealthFailure(response: Response): string {
  if (response.status === 401) {
    return "GitHub rejected this credential. Reconnect GitHub.";
  }
  if (response.status === 403) {
    return "GitHub denied this request. Check org approval, SSO, or rate limits.";
  }
  if (response.status === 404) {
    return "GitHub could not find this resource for the current credential.";
  }
  return `GitHub returned ${response.status} ${response.statusText || "error"}.`;
}

async function fetchGithubHealthEndpoint(args: { token: string; url: string }): Promise<Response> {
  return await fetchWithTimeout(args.url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "samebase-app",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

function computeCloudflareRefreshWindowStartAt(expiresAt: number): number {
  return expiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS;
}

function computeCloudflareNextAutoCheckAt(args: { expiresAt: number; now: number }): number {
  const refreshWindowStartAt = computeCloudflareRefreshWindowStartAt(args.expiresAt);
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

function computeCloudflareRetryDueAt(previousCheckedAt: number | undefined, now: number): number {
  const retryDelayMs = computeCloudflareRetryDelayMs(previousCheckedAt, now);
  return (previousCheckedAt ?? now) + retryDelayMs;
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
  const derivedNextAutoCheckAt =
    connection.tokenHealth?.source === "runtime_error"
      ? computeCloudflareRetryDueAt(connection.tokenHealth.checkedAt, now)
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
    mcpTokenError: connection.tokenHealth?.errorMessage,
    ...(typeof nextAutoCheckAt === "number" ? { mcpTokenNextAutoCheckAt: nextAutoCheckAt } : {}),
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
      "User-Agent": "samebase-app",
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
    throw error;
  }
}

// Public

export const viewer = query({
  access: "access_public",
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
      hasCloudflareConnection: boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = ctx.viewer.userId;
    const user = ctx.viewer.user;
    if (userId === null || !user) {
      return null;
    }

    const [github, convex, cloudflare] = await Promise.all([
      getConnectionByUserAndKind(ctx.db, userId, "github"),
      getConnectionByUserAndKind(ctx.db, userId, "convex"),
      getConnectionByUserAndKind(ctx.db, userId, "cloudflare"),
    ]);

    const githubUsername = github?.kind === "github" ? github.username : undefined;

    return {
      _id: user._id,
      name: user.name,
      image: user.image,
      email: user.email,
      githubUsername,
      hasGithubConnection: github !== null,
      hasConvexConnection: convex !== null,
      hasCloudflareConnection: cloudflare !== null,
    };
  },
});

export const getViewerAuthProviders = query({
  access: "access_public",
  args: {},
  returns: authProviderSummaryValidator,
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

    const providers: string[] = [];
    const seen = new Set<string>();
    for (const account of orderedAccounts) {
      if (seen.has(account.provider)) {
        continue;
      }
      seen.add(account.provider);
      providers.push(account.provider);
    }

    const primaryProvider = orderedAccounts[0]?.provider;
    if (primaryProvider) {
      return { providers, primaryProvider };
    }
    return { providers };
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

export const getGithubConnectionStatus = query({
  access: "access_provider_connections",
  args: {},
  returns: v.object({
    connected: boolean(),
    username: v.optional(v.string()),
    authMethod: v.optional(providerAuthMethodValidator),
  }),
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "github");
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

export const getGithubProviderSummary = query({
  access: "access_provider_connections",
  args: {},
  returns: githubProviderSummaryValidator,
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "github");
    return buildGithubProviderSummary(connection);
  },
});

export const checkGithubConnectionHealth = action({
  access: "access_provider_connections",
  args: {},
  returns: githubConnectionHealthValidator,
  handler: async (ctx): Promise<GithubConnectionHealth> => {
    const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    const summary = buildGithubProviderSummary(connection);
    const checkedAt = Date.now();
    if (connection?.kind !== "github") {
      return {
        connected: false,
        checkedAt,
        grantedScopes: [],
        requiredScopes: buildGithubRequiredScopeHealth({
          authMethod: "oauth",
          grantedScopes: [],
        }),
        checks: [
          {
            key: "profile",
            label: "Profile",
            status: "unknown",
            message: "GitHub is not connected.",
          },
          {
            key: "repositories",
            label: "Repository listing",
            status: "unknown",
            message: "GitHub is not connected.",
          },
        ],
        reauthorizeAvailable: false,
      };
    }

    const profileResponse = await fetchGithubHealthEndpoint({
      token: connection.auth.credential,
      url: `${GITHUB_API_BASE}/user`,
    });
    const profileScopes = parseGitHubOAuthScopesHeader(
      profileResponse.headers.get("x-oauth-scopes"),
    );
    let grantedScopes = profileScopes;
    let username = connection.username;
    const checks: GithubConnectionHealth["checks"] = [];

    if (profileResponse.ok) {
      const profilePayload = await profileResponse.json().catch(() => null);
      const login = isRecord(profilePayload) ? readString(profilePayload, "login") : null;
      if (login) {
        username = login;
        checks.push({
          key: "profile",
          label: "Profile",
          status: "ok",
          message: `Authenticated as ${login}.`,
        });
      } else {
        checks.push({
          key: "profile",
          label: "Profile",
          status: "error",
          message: "GitHub profile response did not include a username.",
        });
      }
    } else {
      checks.push({
        key: "profile",
        label: "Profile",
        status: "error",
        message: formatGithubHealthFailure(profileResponse),
      });
    }

    if (profileResponse.ok) {
      const repositoryResponse = await fetchGithubHealthEndpoint({
        token: connection.auth.credential,
        url: `${GITHUB_API_BASE}/user/repos?sort=updated&per_page=1&affiliation=owner,collaborator,organization_member`,
      });
      grantedScopes = mergeGithubScopes(
        grantedScopes,
        parseGitHubOAuthScopesHeader(repositoryResponse.headers.get("x-oauth-scopes")),
      );
      checks.push(
        repositoryResponse.ok
          ? {
              key: "repositories",
              label: "Repository listing",
              status: "ok",
              message: "GitHub returned repositories visible to this credential.",
            }
          : {
              key: "repositories",
              label: "Repository listing",
              status: "error",
              message: formatGithubHealthFailure(repositoryResponse),
            },
      );
    } else {
      checks.push({
        key: "repositories",
        label: "Repository listing",
        status: "unknown",
        message: "Skipped because the profile check failed.",
      });
    }

    return {
      connected: true,
      username,
      authMethod: connection.auth.method,
      checkedAt,
      grantedScopes,
      requiredScopes: buildGithubRequiredScopeHealth({
        authMethod: connection.auth.method,
        grantedScopes,
      }),
      checks,
      ...(summary.manageUrl ? { manageUrl: summary.manageUrl } : {}),
      reauthorizeAvailable: summary.reauthorizeAvailable,
    };
  },
});

export const disconnectGithub = mutation({
  access: "access_provider_connections",
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "github");
    if (connection) {
      await ctx.db.delete(connection._id);
    }
  },
});

export const getConvexConnectionStatus = query({
  access: "access_provider_connections",
  args: {},
  returns: v.object({
    connected: boolean(),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
    authMethod: v.optional(providerAuthMethodValidator),
  }),
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "convex");
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
  access: "access_provider_connections",
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "convex");
    if (connection) {
      await ctx.db.delete(connection._id);
    }
  },
});

export const getCloudflareConnectionStatus = query({
  access: "access_provider_connections",
  args: {},
  returns: cloudflareConnectionStatusValidator,
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "cloudflare");
    if (connection?.kind !== "cloudflare") {
      return { connected: false };
    }

    return buildCloudflareConnectionStatus(connection);
  },
});

const cloudflareAutoRefreshTriggerValidator = union(
  literal("focus"),
  literal("visibility"),
  literal("page_load"),
  literal("poll"),
  literal("manual"),
);
type CloudflareAutoRefreshTrigger = Infer<typeof cloudflareAutoRefreshTriggerValidator>;

async function runCloudflareMcpTokenRefresh(args: {
  ctx: ActionCtx;
  userId: Id<"users">;
  trigger: CloudflareAutoRefreshTrigger;
  force?: boolean;
}): Promise<CloudflareConnectionStatus> {
  const connection = await args.ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId: args.userId,
    kind: "cloudflare",
  });
  if (connection?.kind !== "cloudflare") {
    return { connected: false };
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
  const refreshDueAt = computeCloudflareRefreshWindowStartAt(effectiveExpiresAt);

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
      userId: args.userId,
      force: forceRefresh,
      debounceMs,
    },
  );
  if (!claim.claimed) {
    const refreshedConnection = await args.ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId: args.userId,
        kind: "cloudflare",
      },
    );
    if (refreshedConnection?.kind !== "cloudflare") {
      return { connected: false };
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
      internal.cloudflareMcpOAuth.resolveConnectionForUser,
      {
        userId: args.userId,
        forceRefresh: true,
      },
    );
    if (resolvedConnection === null) {
      return { connected: false };
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
  } catch (error) {
    const refreshedConnection = await args.ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId: args.userId,
        kind: "cloudflare",
      },
    );
    if (refreshedConnection?.kind === "cloudflare") {
      const nowAfterFailure = Date.now();
      const retryDueAt = computeCloudflareRetryDueAt(
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
    throw error;
  } finally {
    await args.ctx.runMutation(internal.providerConnections.releaseCloudflareTokenRefresh, {
      userId: args.userId,
      recordLastTokenRefreshAt: shouldRecordLastTokenRefreshAt,
    });
  }
}

export const refreshCloudflareMcpTokenIfNeeded = action({
  access: "access_provider_connections",
  args: {
    trigger: optional(cloudflareAutoRefreshTriggerValidator),
    force: optional(boolean()),
  },
  returns: cloudflareConnectionStatusValidator,
  handler: async (ctx, args) => {
    return await runCloudflareMcpTokenRefresh({
      ctx,
      userId: ctx.viewer.userId,
      trigger: args.trigger ?? "manual",
      force: args.force,
    });
  },
});

export const checkCloudflareMcpTokenHealth = action({
  access: "access_provider_connections",
  args: {},
  returns: cloudflareConnectionStatusValidator,
  handler: async (ctx) => {
    return await runCloudflareMcpTokenRefresh({
      ctx,
      userId: ctx.viewer.userId,
      trigger: "manual",
      force: true,
    });
  },
});

export const disconnectCloudflare = mutation({
  access: "access_provider_connections",
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "cloudflare");
    if (connection) {
      await ctx.db.delete(connection._id);
    }
  },
});

const githubApiKeyConnectionResultValidator = v.object({
  username: v.string(),
});

const convexApiKeyConnectionResultValidator = v.object({
  teamId: v.string(),
});

export const connectGithubWithApiKey = action({
  access: "access_provider_connections",
  args: {
    token: v.string(),
  },
  returns: githubApiKeyConnectionResultValidator,
  handler: async (ctx, args) => {
    const token = normalizeApiToken(args.token);
    const identity = await fetchGithubIdentity(token);

    await ctx.runMutation(internal.providerConnections.upsertGithub, {
      userId: ctx.viewer.userId,
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
  access: "access_provider_connections",
  args: {
    token: v.string(),
  },
  returns: convexApiKeyConnectionResultValidator,
  handler: async (ctx, args) => {
    const token = normalizeApiToken(args.token);
    const details = await fetchConvexApiKeyTeamDetails(token);

    await ctx.runMutation(internal.providerConnections.upsertConvex, {
      userId: ctx.viewer.userId,
      auth: {
        method: "api_key",
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
