import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { Infer, v } from "convex/values";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { vViewerAccess, vViewerRoleResult } from "./accessModelValidators";
import { getConnectionByUserAndKind } from "./providerConnections";
import { action, mutation, query } from "./functions";
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
const GITHUB_REPOSITORY_DISCOVERY_AFFILIATION = "owner,collaborator,organization_member" as const;

const vAuthProviderSummary = object({
  providers: array(string()),
  primaryProvider: optional(string()),
});

type AuthProviderAccountSummary = {
  _creationTime: number;
  _id: string;
  provider: string;
};

const vProviderAuthMethod = union(literal("oauth"), literal("mcp_oauth"), literal("api_key"));
const vGithubOAuthScopeRequirement = object({
  scope: string(),
  label: string(),
});
const vGithubScopeStatus = union(literal("granted"), literal("missing"), literal("unknown"));
const vGithubRequiredScopeHealth = object({
  scope: string(),
  label: string(),
  status: vGithubScopeStatus,
});
const vGithubOrganizationAccess = object({
  login: string(),
  role: string(),
  canCreateRepository: boolean(),
});
const vGithubProviderSummary = object({
  connected: boolean(),
  username: optional(string()),
  authMethod: optional(vProviderAuthMethod),
  requiredScopes: array(vGithubOAuthScopeRequirement),
  manageUrl: optional(string()),
  reauthorizeAvailable: boolean(),
});
const vGithubHealthCheckKey = union(
  literal("profile"),
  literal("repositories"),
  literal("organizations"),
);
const vGithubHealthCheckStatus = union(literal("ok"), literal("error"), literal("unknown"));
const vGithubHealthCheck = object({
  key: vGithubHealthCheckKey,
  label: string(),
  status: vGithubHealthCheckStatus,
  message: optional(string()),
});
const vGithubConnectionHealth = object({
  connected: boolean(),
  username: optional(string()),
  authMethod: optional(vProviderAuthMethod),
  checkedAt: number(),
  grantedScopes: array(string()),
  requiredScopes: array(vGithubRequiredScopeHealth),
  organizations: array(vGithubOrganizationAccess),
  checks: array(vGithubHealthCheck),
  manageUrl: optional(string()),
  reauthorizeAvailable: boolean(),
});
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
  mcpTokenError: optional(string()),
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
type GithubProviderSummary = Infer<typeof vGithubProviderSummary>;
type GithubConnectionHealth = Infer<typeof vGithubConnectionHealth>;
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
type GitHubApiFailure = {
  status: number;
  statusText: string;
};
type GitHubProfileHealthResult =
  | {
      ok: true;
      login: string;
      oauthScopesHeader: string | null;
    }
  | {
      ok: false;
      failure: GitHubApiFailure;
      oauthScopesHeader: string | null;
    };
type GitHubRepositoryHealthResult =
  | {
      ok: true;
      oauthScopesHeader: string | null;
    }
  | {
      ok: false;
      failure: GitHubApiFailure;
      oauthScopesHeader: string | null;
    };
type GitHubOrganizationHealthResult =
  | {
      ok: true;
      organizations: GithubConnectionHealth["organizations"];
      oauthScopesHeader: string | null;
    }
  | {
      ok: false;
      failure: GitHubApiFailure;
      oauthScopesHeader: string | null;
    };

function buildDisconnectedCloudflareConnectionStatus() {
  return {
    connected: false,
  } satisfies CloudflareConnectionStatus;
}

async function runGitHubRequestWithTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createGitHubOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: "samebase-app",
  });
}

function readGitHubResponseHeader(
  headers: Record<string, string | number | undefined>,
  key: string,
): string | null {
  const value = headers[key.toLowerCase()];
  return typeof value === "string" ? value : null;
}

/**
Reads GitHub's `x-oauth-scopes` response header from a failed Octokit request.
GitHub sends values like `"repo, user, read:org"` to report the scopes on the credential used for
that request.
*/
function readGitHubErrorOAuthScopesHeader(error: RequestError): string | null {
  return readGitHubResponseHeader(error.response?.headers ?? {}, "x-oauth-scopes");
}

/**
Reads GitHub's `x-oauth-scopes` response header from a successful Octokit response.
Example: a header value of `"repo, user"` means GitHub reports that this token currently has the
`repo` and `user` OAuth scopes.
*/
function readGitHubSuccessOAuthScopesHeader(response: {
  headers: Record<string, string | number | undefined>;
}): string | null {
  return readGitHubResponseHeader(response.headers, "x-oauth-scopes");
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
    reauthorizeAvailable: connection.auth.method === "oauth",
  };
}

/**
Parses GitHub's comma-separated `x-oauth-scopes` response header into first-seen scope names.
Examples:
`parseGitHubOAuthScopesHeader("repo, user, repo")` returns `["repo", "user"]`.
`parseGitHubOAuthScopesHeader(null)` returns `[]`.
*/
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

/**
Merges OAuth scope lists while preserving first-seen order.
Example: merging `["repo", "user"]` and `["read:org", "repo"]` returns
`["repo", "user", "read:org"]`.
*/
function mergeGitHubOAuthScopes(first: readonly string[], second: readonly string[]): string[] {
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

/**
Maps Samebase's required GitHub OAuth scopes to granted, missing, or unknown status.
Examples:
`repo` is granted only when GitHub reports `repo`.
`user:email` is granted when GitHub reports either `user:email` or the broader `user` scope.
If GitHub did not send an `x-oauth-scopes` header, every required scope is `unknown`.
*/
export function buildGithubRequiredScopeHealth(args: {
  grantedScopes: readonly string[];
  scopeReportAvailable: boolean;
}): GithubConnectionHealth["requiredScopes"] {
  const grantedScopeSet = new Set(args.grantedScopes);
  return getGitHubOAuthScopeRequirements().map((scopeRequirement) => ({
    ...scopeRequirement,
    status: args.scopeReportAvailable
      ? isGitHubOAuthScopeGranted(scopeRequirement.scope, grantedScopeSet)
        ? "granted"
        : "missing"
      : "unknown",
  }));
}

function formatGithubHealthFailure(failure: GitHubApiFailure): string {
  if (failure.status === 401) {
    return "GitHub rejected this credential. Reconnect GitHub.";
  }
  if (failure.status === 403) {
    return "GitHub denied this request. Check org approval, SSO, or rate limits.";
  }
  if (failure.status === 404) {
    return "GitHub could not find this resource for the current credential.";
  }
  return `GitHub returned ${failure.status} ${failure.statusText || "error"}.`;
}

/**
Checks whether the credential can read the authenticated GitHub profile.
Example: a successful `/user` response with `{ login: "octo" }` returns
`{ ok: true, login: "octo" }` plus the `x-oauth-scopes` header when GitHub sends it.
*/
async function readGithubProfileHealth(octokit: Octokit): Promise<GitHubProfileHealthResult> {
  try {
    const response = await runGitHubRequestWithTimeout((signal) =>
      octokit.rest.users.getAuthenticated({
        request: { signal },
      }),
    );
    return {
      ok: true,
      login: response.data.login,
      oauthScopesHeader: readGitHubSuccessOAuthScopesHeader(response),
    };
  } catch (error) {
    if (error instanceof RequestError) {
      return {
        ok: false,
        failure: {
          status: error.status,
          statusText: error.message,
        },
        oauthScopesHeader: readGitHubErrorOAuthScopesHeader(error),
      };
    }
    throw error;
  }
}

/**
Checks whether GitHub accepts repository listing for the credential.
Example: a `200` response from `/user/repos?per_page=1` returns `ok: true`; a `403` response
returns `ok: false` so the UI can point users at org approval, SSO, or rate-limit issues.
*/
async function readGithubRepositoryHealth(octokit: Octokit): Promise<GitHubRepositoryHealthResult> {
  try {
    const response = await runGitHubRequestWithTimeout((signal) =>
      octokit.rest.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 1,
        affiliation: GITHUB_REPOSITORY_DISCOVERY_AFFILIATION,
        request: { signal },
      }),
    );
    return {
      ok: true,
      oauthScopesHeader: readGitHubSuccessOAuthScopesHeader(response),
    };
  } catch (error) {
    if (error instanceof RequestError) {
      return {
        ok: false,
        failure: {
          status: error.status,
          statusText: error.message,
        },
        oauthScopesHeader: readGitHubErrorOAuthScopesHeader(error),
      };
    }
    throw error;
  }
}

/**
Lists active GitHub organization memberships visible to the current credential.
Examples:
an org membership with `{ role: "member", permissions: { can_create_repository: false } }`
returns `{ role: "member", canCreateRepository: false }`.
an org membership with `{ role: "admin" }` falls back to `canCreateRepository: true` when GitHub
omits the explicit permission field.
*/
async function readGithubOrganizationHealth(
  octokit: Octokit,
): Promise<GitHubOrganizationHealthResult> {
  try {
    let oauthScopesHeader: string | null = null;
    const organizationAccess: GithubConnectionHealth["organizations"] = [];
    const seenOrganizationLogins = new Set<string>();
    for (let page = 1; ; page += 1) {
      const response = await runGitHubRequestWithTimeout((signal) =>
        octokit.rest.orgs.listMembershipsForAuthenticatedUser({
          state: "active",
          per_page: 100,
          page,
          request: { signal },
        }),
      );
      oauthScopesHeader = oauthScopesHeader ?? readGitHubSuccessOAuthScopesHeader(response);
      for (const membership of response.data) {
        const login = membership.organization.login;
        if (!login || seenOrganizationLogins.has(login)) {
          continue;
        }
        seenOrganizationLogins.add(login);
        organizationAccess.push({
          login,
          role: membership.role,
          canCreateRepository:
            membership.permissions?.can_create_repository ?? membership.role === "admin",
        });
      }
      if (response.data.length < 100) {
        break;
      }
    }

    return {
      ok: true,
      organizations: organizationAccess.sort((left, right) =>
        left.login.localeCompare(right.login),
      ),
      oauthScopesHeader,
    };
  } catch (error) {
    if (error instanceof RequestError) {
      return {
        ok: false,
        failure: {
          status: error.status,
          statusText: error.message,
        },
        oauthScopesHeader: readGitHubErrorOAuthScopesHeader(error),
      };
    }
    throw error;
  }
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
  let response: Awaited<ReturnType<Octokit["rest"]["users"]["getAuthenticated"]>>;
  try {
    response = await runGitHubRequestWithTimeout((signal) =>
      createGitHubOctokit(token).rest.users.getAuthenticated({
        request: { signal },
      }),
    );
  } catch (error) {
    if (error instanceof RequestError) {
      throw new Error("Invalid GitHub API key");
    }
    throw error;
  }

  if (!response.data.login) {
    throw new Error("Invalid GitHub API key");
  }

  return { username: response.data.login };
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
    authMethod: v.optional(vProviderAuthMethod),
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
  returns: vGithubProviderSummary,
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "github");
    return buildGithubProviderSummary(connection);
  },
});

export const checkGithubConnectionHealth = action({
  access: "access_provider_connections",
  args: {},
  returns: vGithubConnectionHealth,
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
          grantedScopes: [],
          scopeReportAvailable: false,
        }),
        organizations: [],
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
          {
            key: "organizations",
            label: "Organization access",
            status: "unknown",
            message: "GitHub is not connected.",
          },
        ],
        reauthorizeAvailable: false,
      };
    }

    const octokit = createGitHubOctokit(connection.auth.credential);
    const profileResponse = await readGithubProfileHealth(octokit);
    const profileOAuthScopesHeader = profileResponse.oauthScopesHeader;
    const profileScopes = parseGitHubOAuthScopesHeader(profileOAuthScopesHeader);
    let grantedScopes = profileScopes;
    let scopeReportAvailable = profileOAuthScopesHeader !== null;
    let username = connection.username;
    let organizations: GithubConnectionHealth["organizations"] = [];
    const checks: GithubConnectionHealth["checks"] = [];

    if (profileResponse.ok) {
      if (profileResponse.login) {
        username = profileResponse.login;
        checks.push({
          key: "profile",
          label: "Profile",
          status: "ok",
          message: `Authenticated as ${profileResponse.login}.`,
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
        message: formatGithubHealthFailure(profileResponse.failure),
      });
    }

    if (profileResponse.ok) {
      const repositoryResponse = await readGithubRepositoryHealth(octokit);
      const repositoryOAuthScopesHeader = repositoryResponse.oauthScopesHeader;
      scopeReportAvailable = scopeReportAvailable || repositoryOAuthScopesHeader !== null;
      grantedScopes = mergeGitHubOAuthScopes(
        grantedScopes,
        parseGitHubOAuthScopesHeader(repositoryOAuthScopesHeader),
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
              message: formatGithubHealthFailure(repositoryResponse.failure),
            },
      );

      const organizationResponse = await readGithubOrganizationHealth(octokit);
      const organizationOAuthScopesHeader = organizationResponse.oauthScopesHeader;
      scopeReportAvailable = scopeReportAvailable || organizationOAuthScopesHeader !== null;
      grantedScopes = mergeGitHubOAuthScopes(
        grantedScopes,
        parseGitHubOAuthScopesHeader(organizationOAuthScopesHeader),
      );
      if (organizationResponse.ok) {
        organizations = organizationResponse.organizations;
        checks.push({
          key: "organizations",
          label: "Organization access",
          status: "ok",
          message:
            organizations.length > 0
              ? `GitHub returned ${organizations.length} organization${organizations.length === 1 ? "" : "s"} visible to this credential.`
              : "No organizations are visible to this credential.",
        });
      } else {
        checks.push({
          key: "organizations",
          label: "Organization access",
          status: "error",
          message: formatGithubHealthFailure(organizationResponse.failure),
        });
      }
    } else {
      checks.push({
        key: "repositories",
        label: "Repository listing",
        status: "unknown",
        message: "Skipped because the profile check failed.",
      });
      checks.push({
        key: "organizations",
        label: "Organization access",
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
        grantedScopes,
        scopeReportAvailable,
      }),
      organizations,
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
    authMethod: v.optional(vProviderAuthMethod),
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
  returns: vCloudflareConnectionStatus,
  handler: async (ctx) => {
    const connection = await getConnectionByUserAndKind(ctx.db, ctx.viewer.userId, "cloudflare");
    if (connection?.kind !== "cloudflare") {
      return buildDisconnectedCloudflareConnectionStatus();
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
  userId: Id<"users">;
  trigger: CloudflareAutoRefreshTrigger;
  force?: boolean;
}): Promise<CloudflareConnectionStatus> {
  const connection = await args.ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId: args.userId,
    kind: "cloudflare",
  });
  if (connection?.kind !== "cloudflare") {
    return buildDisconnectedCloudflareConnectionStatus();
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
      return buildDisconnectedCloudflareConnectionStatus();
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
      return buildDisconnectedCloudflareConnectionStatus();
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
    trigger: optional(vCloudflareAutoRefreshTrigger),
    force: optional(boolean()),
  },
  returns: vCloudflareConnectionStatus,
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
  returns: vCloudflareConnectionStatus,
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

const vGithubApiKeyConnectionResult = v.object({
  username: v.string(),
});

const vConvexApiKeyConnectionResult = v.object({
  teamId: v.string(),
});

export const connectGithubWithApiKey = action({
  access: "access_provider_connections",
  args: {
    token: v.string(),
  },
  returns: vGithubApiKeyConnectionResult,
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
  returns: vConvexApiKeyConnectionResult,
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
