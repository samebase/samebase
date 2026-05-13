import { Infer, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { vMcpTokenHealth } from "./mcpTokenHealth";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
} from "../shared/cloudflareTokenRefresh";

const {
  array,
  boolean,
  id,
  literal,
  null: vNull,
  number,
  object,
  optional,
  string,
  union,
} = v;

const vProviderKind = union(
  literal("github"),
  literal("convex"),
  literal("cloudflare"),
);
export type ProviderKind = Infer<typeof vProviderKind>;

const vOAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
});
const vMcpOauthAuth = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
  clientId: optional(string()),
  mcpServerUrl: string(),
});
const vApiKeyAuth = object({
  method: literal("api_key"),
  credential: string(),
  credentialExpiresAt: optional(number()),
});
const vProviderAuth = union(vOAuthAuth, vMcpOauthAuth, vApiKeyAuth);
export type ProviderAuth = Infer<typeof vProviderAuth>;

const vStandardProviderAuth = union(vOAuthAuth, vApiKeyAuth);
const vCloudflareProviderAuth = union(vMcpOauthAuth, vApiKeyAuth);

const vGithubConnectionUpsert = object({
  userId: id("users"),
  auth: vStandardProviderAuth,
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
  accountId: optional(string()),
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
  accountId: optional(string()),
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

async function deleteConnectionByUserAndKind(
  db: DatabaseWriter,
  userId: Id<"users">,
  kind: ProviderKind,
): Promise<void> {
  const existing = await getConnectionByUserAndKind(db, userId, kind);
  if (!existing) {
    return;
  }
  await db.delete(existing._id);
}

async function upsertGithubConnection(
  db: DatabaseWriter,
  args: Infer<typeof vGithubConnectionUpsert>,
): Promise<void> {
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(db, args.userId, "github");
  if (existing) {
    await db.patch(existing._id, {
      auth: args.auth,
      username: args.username,
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "github",
    userId: args.userId,
    auth: args.auth,
    username: args.username,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertConvexConnection(
  db: DatabaseWriter,
  args: Infer<typeof vConvexConnectionUpsert>,
): Promise<void> {
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(db, args.userId, "convex");
  if (existing) {
    await db.patch(existing._id, {
      auth: args.auth,
      teamId: args.teamId,
      teamSlug: args.teamSlug,
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
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(
    db,
    args.userId,
    "cloudflare",
  );
  if (existing) {
    const patch = {
      auth: args.auth,
      accountId: args.accountId,
      updatedAt: now,
      ...(args.tokenHealth !== undefined
        ? { tokenHealth: args.tokenHealth }
        : {}),
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
    accountId: args.accountId,
    createdAt: now,
    updatedAt: now,
    ...(args.tokenHealth !== undefined
      ? { tokenHealth: args.tokenHealth }
      : {}),
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

export const upsertConvex = internalMutation({
  args: vConvexConnectionUpsert,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertConvexConnection(ctx.db, args);
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
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      args.userId,
      "cloudflare",
    );

    if (
      connection?.kind !== "cloudflare" ||
      connection.auth.method !== "mcp_oauth"
    ) {
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
        nextAllowedRefreshAt:
          tokenRefreshStartedAt + CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
      };
    }

    if (!args.force) {
      const lastTokenRefreshAt = connection.lastTokenRefreshAt;
      if (
        typeof lastTokenRefreshAt === "number" &&
        now - lastTokenRefreshAt < debounceMs
      ) {
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
    const connection = await getConnectionByUserAndKind(
      ctx.db,
      args.userId,
      "cloudflare",
    );
    if (
      connection?.kind !== "cloudflare" ||
      connection.auth.method !== "mcp_oauth"
    ) {
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
