import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Infer, v } from "convex/values";

const ADMIN_USERNAMES = ["nicu-chiciuc"];
const ADMIN_EMAILS = new Set(["nicu.dev@gmail.com", "nicuchiciuc@gmail.com"]);
const ALLOWED_EMAILS = new Set([
  "nicu.dev@gmail.com",
  "nicuchiciuc@gmail.com",
  "noita.lovare@gmail.com",
]);
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const GITHUB_API_BASE = "https://api.github.com";
const CONVEX_TOKEN_DETAILS_URL = "https://api.convex.dev/v1/token_details";
const NETLIFY_API_BASE = "https://api.netlify.com/api/v1";

const authProviderSummaryValidator = v.object({
  providers: v.array(v.string()),
  primaryProvider: v.optional(v.string()),
});
type AuthProviderSummary = Infer<typeof authProviderSummaryValidator>;

type JsonRecord = Record<string, unknown>;
type NetlifyAccount = {
  id: string;
  slug?: string;
  type?: string;
  isDefault?: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberAsString(
  record: JsonRecord,
  key: string,
): string | undefined {
  const value = record[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
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
  userId?: string;
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
  const userId = resolveField(payload, ["userId", "user_id"], {
    key: "user",
    field: "id",
  });
  return { teamId, teamSlug, userId };
}

async function fetchNetlifyConnectionDetails(token: string): Promise<{
  userId?: string;
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
    userId: readString(userPayload, "id"),
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
      hasGithubAccessToken: v.boolean(),
      hasConvexAccessToken: v.boolean(),
      hasNetlifyAccessToken: v.boolean(),
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
    return {
      _id: user._id,
      name: user.name,
      image: user.image,
      email: user.email,
      githubUsername: user.githubUsername,
      hasGithubAccessToken: typeof user.githubAccessToken === "string",
      hasConvexAccessToken: typeof user.convexAccessToken === "string",
      hasNetlifyAccessToken: typeof user.netlifyAccessToken === "string",
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
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    if (!user) return false;
    if (user.isApproved === true) return true;
    if (isAdminUser(user.githubUsername, user.email)) return true;
    if (isAllowedEmail(user.email)) return true;
    return false;
  },
});

export const getGithubConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    username: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return { connected: false };
    }
    return {
      connected: typeof user.githubAccessToken === "string",
      username: user.githubUsername,
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
    await ctx.db.patch(userId, {
      githubAccessToken: undefined,
      githubRefreshToken: undefined,
      githubExpiresAt: undefined,
      githubUsername: undefined,
    });
    return null;
  },
});

export const getConvexConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return { connected: false };
    }
    return {
      connected:
        typeof user.convexAccessToken === "string" &&
        typeof user.convexTeamId === "string",
      teamId: user.convexTeamId,
      teamSlug: user.convexTeamSlug,
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
    await ctx.db.patch(userId, {
      convexAccessToken: undefined,
      convexRefreshToken: undefined,
      convexExpiresAt: undefined,
      convexUserId: undefined,
      convexTeamId: undefined,
      convexTeamSlug: undefined,
    });
    return null;
  },
});

export const getNetlifyConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return { connected: false };
    }
    return {
      connected:
        typeof user.netlifyAccessToken === "string" &&
        (typeof user.netlifyTeamSlug === "string" ||
          typeof user.netlifyTeamId === "string"),
      teamId: user.netlifyTeamId,
      teamSlug: user.netlifyTeamSlug,
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
    await ctx.db.patch(userId, {
      netlifyAccessToken: undefined,
      netlifyRefreshToken: undefined,
      netlifyExpiresAt: undefined,
      netlifyUserId: undefined,
      netlifyTeamId: undefined,
      netlifyTeamSlug: undefined,
    });
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

export const setGithubConnectionFromApiKey = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    username: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      githubAccessToken: args.token,
      githubUsername: args.username,
      githubRefreshToken: undefined,
      githubExpiresAt: undefined,
    });
    return null;
  },
});

export const setConvexConnectionFromApiKey = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    teamId: v.string(),
    teamSlug: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      convexAccessToken: args.token,
      convexTeamId: args.teamId,
      convexTeamSlug: args.teamSlug,
      convexUserId: args.providerUserId,
      convexRefreshToken: undefined,
      convexExpiresAt: undefined,
    });
    return null;
  },
});

export const setNetlifyConnectionFromApiKey = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    teamId: v.string(),
    teamSlug: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      netlifyAccessToken: args.token,
      netlifyTeamId: args.teamId,
      netlifyTeamSlug: args.teamSlug,
      netlifyUserId: args.providerUserId,
      netlifyRefreshToken: undefined,
      netlifyExpiresAt: undefined,
    });
    return null;
  },
});

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

    await ctx.runMutation(internal.users.setGithubConnectionFromApiKey, {
      userId,
      token,
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

    await ctx.runMutation(internal.users.setConvexConnectionFromApiKey, {
      userId,
      token,
      teamId: details.teamId,
      teamSlug: details.teamSlug,
      providerUserId: details.userId,
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

    await ctx.runMutation(internal.users.setNetlifyConnectionFromApiKey, {
      userId,
      token,
      teamId: details.teamId,
      teamSlug: details.teamSlug,
      providerUserId: details.userId,
    });

    return { teamId: details.teamId, teamSlug: details.teamSlug };
  },
});

// Internal

export const getAuthUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId !== null ? ctx.db.get(userId) : null;
  },
});

export const getById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.userId);
  },
});
