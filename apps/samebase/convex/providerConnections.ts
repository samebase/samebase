import { Infer, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { vMcpTokenHealth } from "./mcpTokenHealth";
import { vCloudflareDefaultAccount, type CloudflareDefaultAccount } from "./schema";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
} from "../shared/cloudflareTokenRefresh";

const { array, boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

const vProviderKind = union(literal("github"), literal("convex"), literal("cloudflare"));
export type ProviderKind = Infer<typeof vProviderKind>;

const vOAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
});
const vCloudflareOAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
});
const vMcpOauthAuth = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
  clientId: string(),
});
const vApiKeyAuth = object({
  method: literal("api_key"),
  credential: string(),
});
const vProviderAuth = union(vOAuthAuth, vMcpOauthAuth, vApiKeyAuth);
export type ProviderAuth = Infer<typeof vProviderAuth>;

const vStandardProviderAuth = union(vOAuthAuth, vApiKeyAuth);
const vCloudflareProviderAuth = union(vCloudflareOAuthAuth, vMcpOauthAuth, vApiKeyAuth);

const vGithubConnectionUpsert = object({
  userId: id("users"),
  auth: vStandardProviderAuth,
  githubAccountId: number(),
  username: optional(string()),
});
const vConvexConnectionUpsert = object({
  userId: id("users"),
  auth: vStandardProviderAuth,
  teamId: string(),
  teamSlug: optional(string()),
});
const vCloudflareConnectionUpsert = object({
  userId: id("users"),
  auth: vCloudflareProviderAuth,
  defaultAccount: vCloudflareDefaultAccount,
  tokenHealth: optional(vMcpTokenHealth),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
});

const vGithubConnectionResult = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("github"),
  userId: id("users"),
  auth: vStandardProviderAuth,
  githubAccountId: optional(number()),
  username: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const vConvexConnectionResult = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("convex"),
  userId: id("users"),
  auth: vStandardProviderAuth,
  teamId: string(),
  teamSlug: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const vCloudflareConnectionResult = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("cloudflare"),
  userId: id("users"),
  auth: vCloudflareProviderAuth,
  defaultAccount: vCloudflareDefaultAccount,
  tokenHealth: optional(vMcpTokenHealth),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});
const vProviderConnectionResult = union(
  vGithubConnectionResult,
  vConvexConnectionResult,
  vCloudflareConnectionResult,
);

export function buildSeedCloudflareDefaultAccount(
  accountId: string | null | undefined,
): CloudflareDefaultAccount {
  const normalizedAccountId = accountId?.trim();
  if (!normalizedAccountId) {
    return { state: "not_selected" };
  }

  // The seed env only carries the account id; listing accounts later replaces
  // this display fallback with Cloudflare's current account name.
  return {
    state: "selected",
    accountId: normalizedAccountId,
    accountName: normalizedAccountId,
  };
}

export async function getConnectionByUserAndKind(
  db: DatabaseReader,
  userId: Id<"users">,
  kind: ProviderKind,
): Promise<Doc<"providerConnections"> | null> {
  return await db
    .query("providerConnections")
    .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
    .first();
}

export async function assertProviderConnectionWriteAllowed(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<void> {
  const user = await db.get(userId);
  if (user === null || user.accountDeletion !== undefined) {
    throw new Error("Provider connections are unavailable during account deletion.");
  }
}

async function deleteConnectionByUserAndKind(
  db: DatabaseWriter,
  userId: Id<"users">,
  kind: ProviderKind,
): Promise<void> {
  await assertProviderConnectionWriteAllowed(db, userId);
  const existing = await getConnectionByUserAndKind(db, userId, kind);
  if (!existing) {
    return;
  }
  await deleteProviderConnection(db, existing);
}

async function deleteGitHubGraphqlRateBudgetIfUnreferenced(
  db: DatabaseWriter,
  githubAccountId: number,
): Promise<void> {
  const connection = await db
    .query("providerConnections")
    .withIndex("by_kind_and_githubAccountId", (query) =>
      query.eq("kind", "github").eq("githubAccountId", githubAccountId),
    )
    .first();
  if (connection) {
    return;
  }

  const budget = await db
    .query("githubGraphqlRateBudgets")
    .withIndex("by_githubAccountId", (query) => query.eq("githubAccountId", githubAccountId))
    .unique();
  if (budget) {
    await db.delete(budget._id);
  }
}

export async function deleteProviderConnection(
  db: DatabaseWriter,
  connection: Doc<"providerConnections">,
): Promise<void> {
  await db.delete(connection._id);
  if (connection.kind === "github" && connection.githubAccountId !== undefined) {
    await deleteGitHubGraphqlRateBudgetIfUnreferenced(db, connection.githubAccountId);
  }
}

async function upsertGithubConnection(
  db: DatabaseWriter,
  args: Infer<typeof vGithubConnectionUpsert>,
): Promise<void> {
  await assertProviderConnectionWriteAllowed(db, args.userId);
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(db, args.userId, "github");
  if (existing) {
    if (existing.kind !== "github") {
      throw new Error("GitHub connection lookup returned another provider.");
    }
    const previousGithubAccountId = existing.githubAccountId;
    await db.patch(existing._id, {
      auth: args.auth,
      githubAccountId: args.githubAccountId,
      username: args.username,
      updatedAt: Math.max(now, existing.updatedAt + 1),
    });
    if (previousGithubAccountId !== undefined && previousGithubAccountId !== args.githubAccountId) {
      await deleteGitHubGraphqlRateBudgetIfUnreferenced(db, previousGithubAccountId);
    }
    return;
  }
  await db.insert("providerConnections", {
    kind: "github",
    userId: args.userId,
    auth: args.auth,
    githubAccountId: args.githubAccountId,
    username: args.username,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertConvexConnection(
  db: DatabaseWriter,
  args: Infer<typeof vConvexConnectionUpsert>,
): Promise<void> {
  await assertProviderConnectionWriteAllowed(db, args.userId);
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(db, args.userId, "convex");
  if (existing) {
    if (existing.kind !== "convex") {
      throw new Error("Convex connection lookup returned another provider.");
    }
    const teamSlug =
      args.teamSlug !== undefined || existing.teamId !== args.teamId
        ? args.teamSlug
        : existing.teamSlug;
    await db.patch(existing._id, {
      auth: args.auth,
      teamId: args.teamId,
      teamSlug,
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "convex",
    userId: args.userId,
    auth: args.auth,
    teamId: args.teamId,
    teamSlug: args.teamSlug,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertCloudflareConnection(
  db: DatabaseWriter,
  args: Infer<typeof vCloudflareConnectionUpsert>,
): Promise<void> {
  await assertProviderConnectionWriteAllowed(db, args.userId);
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(db, args.userId, "cloudflare");
  if (existing) {
    const patch = {
      auth: args.auth,
      defaultAccount: args.defaultAccount,
      updatedAt: now,
      ...(args.tokenHealth !== undefined ? { tokenHealth: args.tokenHealth } : {}),
      ...(args.tokenRefreshStartedAt !== undefined
        ? { tokenRefreshStartedAt: args.tokenRefreshStartedAt }
        : {}),
      ...(args.lastTokenRefreshAt !== undefined
        ? { lastTokenRefreshAt: args.lastTokenRefreshAt }
        : {}),
    };
    await db.patch(existing._id, patch);
    return;
  }
  const doc = {
    kind: "cloudflare" as const,
    userId: args.userId,
    auth: args.auth,
    defaultAccount: args.defaultAccount,
    createdAt: now,
    updatedAt: now,
    ...(args.tokenHealth !== undefined ? { tokenHealth: args.tokenHealth } : {}),
    ...(args.tokenRefreshStartedAt !== undefined
      ? { tokenRefreshStartedAt: args.tokenRefreshStartedAt }
      : {}),
    ...(args.lastTokenRefreshAt !== undefined
      ? { lastTokenRefreshAt: args.lastTokenRefreshAt }
      : {}),
  };
  await db.insert("providerConnections", doc);
}

export const getByUserAndKind = internalQuery({
  args: {
    userId: id("users"),
    kind: vProviderKind,
  },
  returns: union(vProviderConnectionResult, vNull()),
  handler: async (ctx, args) => {
    return await getConnectionByUserAndKind(ctx.db, args.userId, args.kind);
  },
});

export const listByUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: array(vProviderConnectionResult),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const upsertGithub = internalMutation({
  args: vGithubConnectionUpsert,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertGithubConnection(ctx.db, args);
    return null;
  },
});

export const setGithubIdentityIfUnchanged = internalMutation({
  args: {
    providerConnectionId: id("providerConnections"),
    expectedUpdatedAt: number(),
    githubAccountId: number(),
    username: string(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const connection = await ctx.db.get(args.providerConnectionId);
    if (
      connection?.kind !== "github" ||
      connection.updatedAt !== args.expectedUpdatedAt ||
      connection.githubAccountId !== undefined
    ) {
      return false;
    }

    await ctx.db.patch(connection._id, {
      githubAccountId: args.githubAccountId,
      username: args.username,
      updatedAt: Math.max(Date.now(), connection.updatedAt + 1),
    });
    return true;
  },
});

export const upsertConvex = internalMutation({
  args: vConvexConnectionUpsert,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertConvexConnection(ctx.db, args);
    return null;
  },
});

export const setConvexTeamSlug = internalMutation({
  args: {
    userId: id("users"),
    teamId: string(),
    teamSlug: string(),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await assertProviderConnectionWriteAllowed(ctx.db, args.userId);
    const existing = await getConnectionByUserAndKind(ctx.db, args.userId, "convex");
    if (existing?.kind !== "convex" || existing.teamId !== args.teamId) {
      throw new Error("Convex connection changed before team slug update.");
    }

    await ctx.db.patch(existing._id, {
      teamSlug: args.teamSlug,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const upsertCloudflare = internalMutation({
  args: vCloudflareConnectionUpsert,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertCloudflareConnection(ctx.db, args);
    return null;
  },
});

export const claimCloudflareTokenRefresh = internalMutation({
  args: {
    userId: id("users"),
    force: optional(boolean()),
    debounceMs: optional(number()),
  },
  returns: object({
    claimed: boolean(),
    nextAllowedRefreshAt: optional(number()),
  }),
  handler: async (ctx, args) => {
    await assertProviderConnectionWriteAllowed(ctx.db, args.userId);
    const connection = await getConnectionByUserAndKind(ctx.db, args.userId, "cloudflare");

    if (connection?.kind !== "cloudflare" || connection.auth.method !== "mcp_oauth") {
      return { claimed: false };
    }

    const now = Date.now();
    const debounceMs =
      args.debounceMs !== undefined
        ? Math.max(0, Math.floor(args.debounceMs))
        : CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS;

    const tokenRefreshStartedAt = connection.tokenRefreshStartedAt;
    if (
      typeof tokenRefreshStartedAt === "number" &&
      now - tokenRefreshStartedAt < CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS
    ) {
      return {
        claimed: false,
        nextAllowedRefreshAt: tokenRefreshStartedAt + CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
      };
    }

    if (!args.force) {
      const lastTokenRefreshAt = connection.lastTokenRefreshAt;
      if (typeof lastTokenRefreshAt === "number" && now - lastTokenRefreshAt < debounceMs) {
        return {
          claimed: false,
          nextAllowedRefreshAt: lastTokenRefreshAt + debounceMs,
        };
      }
    }

    await ctx.db.patch(connection._id, {
      tokenRefreshStartedAt: now,
      updatedAt: now,
    });

    return { claimed: true };
  },
});

export const releaseCloudflareTokenRefresh = internalMutation({
  args: {
    userId: id("users"),
    recordLastTokenRefreshAt: optional(boolean()),
  },
  returns: object({
    lastTokenRefreshAt: optional(number()),
  }),
  handler: async (ctx, args) => {
    await assertProviderConnectionWriteAllowed(ctx.db, args.userId);
    const connection = await getConnectionByUserAndKind(ctx.db, args.userId, "cloudflare");
    if (connection?.kind !== "cloudflare" || connection.auth.method !== "mcp_oauth") {
      return {};
    }

    const now = Date.now();
    await ctx.db.patch(connection._id, {
      tokenRefreshStartedAt: undefined,
      updatedAt: now,
      ...(args.recordLastTokenRefreshAt ? { lastTokenRefreshAt: now } : {}),
    });

    return {
      ...(args.recordLastTokenRefreshAt ? { lastTokenRefreshAt: now } : {}),
    };
  },
});

export const removeByUserAndKind = internalMutation({
  args: {
    userId: id("users"),
    kind: vProviderKind,
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await deleteConnectionByUserAndKind(ctx.db, args.userId, args.kind);
    return null;
  },
});
