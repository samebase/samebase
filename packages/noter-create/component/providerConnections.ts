import type { Infer } from "convex/values";
import { v } from "convex/values";
import {
  mutation,
  query,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server.js";

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

/**
 * App-owned user IDs cross the component boundary as strings because the
 * component cannot validate the parent app's `users` table IDs.
 */
const appUserIdValidator = string();

export const providerKindValidator = union(
  literal("github"),
  literal("convex"),
  literal("cloudflare"),
);
export type ProviderKind = Infer<typeof providerKindValidator>;

const oauthAuthValidator = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
});
const apiKeyAuthValidator = object({
  method: literal("api_key"),
  credential: string(),
  credentialExpiresAt: optional(number()),
});
const mcpOauthAuthValidator = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
  clientId: optional(string()),
  mcpServerUrl: string(),
});

const standardProviderAuthValidator = union(
  oauthAuthValidator,
  apiKeyAuthValidator,
);
const cloudflareProviderAuthValidator = union(
  mcpOauthAuthValidator,
  apiKeyAuthValidator,
);

const mcpTokenHealthStatusValidator = union(
  literal("valid"),
  literal("expiring_soon"),
  literal("expired"),
  literal("invalid"),
  literal("unknown"),
);
const mcpTokenHealthSourceValidator = union(
  literal("expiry_metadata"),
  literal("refresh_attempt"),
  literal("active_probe"),
  literal("runtime_error"),
);
export const mcpTokenHealthValidator = object({
  status: mcpTokenHealthStatusValidator,
  checkedAt: number(),
  expiresAt: optional(number()),
  source: mcpTokenHealthSourceValidator,
  errorMessage: optional(string()),
});

const githubConnectionUpsertValidator = object({
  userId: appUserIdValidator,
  auth: standardProviderAuthValidator,
  username: optional(string()),
});
const convexConnectionUpsertValidator = object({
  userId: appUserIdValidator,
  auth: standardProviderAuthValidator,
  teamId: string(),
  teamSlug: optional(string()),
});
const cloudflareConnectionUpsertValidator = object({
  userId: appUserIdValidator,
  auth: cloudflareProviderAuthValidator,
  accountId: optional(string()),
  tokenHealth: optional(mcpTokenHealthValidator),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
});

const githubConnectionRowValidator = object({
  kind: literal("github"),
  userId: appUserIdValidator,
  auth: standardProviderAuthValidator,
  username: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const convexConnectionRowValidator = object({
  kind: literal("convex"),
  userId: appUserIdValidator,
  auth: standardProviderAuthValidator,
  teamId: string(),
  teamSlug: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const cloudflareConnectionRowValidator = object({
  kind: literal("cloudflare"),
  userId: appUserIdValidator,
  auth: cloudflareProviderAuthValidator,
  accountId: optional(string()),
  tokenHealth: optional(mcpTokenHealthValidator),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});

export const providerConnectionRowValidator = union(
  githubConnectionRowValidator,
  convexConnectionRowValidator,
  cloudflareConnectionRowValidator,
);

const githubConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("github"),
  userId: appUserIdValidator,
  auth: standardProviderAuthValidator,
  username: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const convexConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("convex"),
  userId: appUserIdValidator,
  auth: standardProviderAuthValidator,
  teamId: string(),
  teamSlug: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const cloudflareConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("cloudflare"),
  userId: appUserIdValidator,
  auth: cloudflareProviderAuthValidator,
  accountId: optional(string()),
  tokenHealth: optional(mcpTokenHealthValidator),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});

export const providerConnectionResultValidator = union(
  githubConnectionResultValidator,
  convexConnectionResultValidator,
  cloudflareConnectionResultValidator,
);

export const oauthProviderValidator = union(
  literal("github"),
  literal("convex"),
  literal("cloudflare_mcp"),
);
export const oauthStateRowValidator = object({
  provider: oauthProviderValidator,
  userId: appUserIdValidator,
  state: string(),
  returnToPath: optional(string()),
  codeVerifier: optional(string()),
  clientId: optional(string()),
  clientSecret: optional(string()),
  createdAt: number(),
  expiresAt: number(),
});
const oauthStateResultValidator = object({
  _id: id("oauthStates"),
  _creationTime: number(),
  provider: oauthProviderValidator,
  userId: appUserIdValidator,
  state: string(),
  returnToPath: optional(string()),
  codeVerifier: optional(string()),
  clientId: optional(string()),
  clientSecret: optional(string()),
  createdAt: number(),
  expiresAt: number(),
});

async function getConnectionByUserAndKind(
  db: DatabaseReader,
  userId: string,
  kind: ProviderKind,
) {
  return await db
    .query("providerConnections")
    .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
    .first();
}

async function upsertGithubConnection(
  db: DatabaseWriter,
  args: Infer<typeof githubConnectionUpsertValidator>,
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
    createdAt: now,
    updatedAt: now,
    ...(args.username !== undefined ? { username: args.username } : {}),
  });
}

async function upsertConvexConnection(
  db: DatabaseWriter,
  args: Infer<typeof convexConnectionUpsertValidator>,
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
    createdAt: now,
    updatedAt: now,
    ...(args.teamSlug !== undefined ? { teamSlug: args.teamSlug } : {}),
  });
}

async function upsertCloudflareConnection(
  db: DatabaseWriter,
  args: Infer<typeof cloudflareConnectionUpsertValidator>,
): Promise<void> {
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(
    db,
    args.userId,
    "cloudflare",
  );
  if (existing) {
    await db.patch(existing._id, {
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
    });
    return;
  }

  await db.insert("providerConnections", {
    kind: "cloudflare",
    userId: args.userId,
    auth: args.auth,
    createdAt: now,
    updatedAt: now,
    ...(args.accountId !== undefined ? { accountId: args.accountId } : {}),
    ...(args.tokenHealth !== undefined
      ? { tokenHealth: args.tokenHealth }
      : {}),
    ...(args.tokenRefreshStartedAt !== undefined
      ? { tokenRefreshStartedAt: args.tokenRefreshStartedAt }
      : {}),
    ...(args.lastTokenRefreshAt !== undefined
      ? { lastTokenRefreshAt: args.lastTokenRefreshAt }
      : {}),
  });
}

export const getByUserAndKind = query({
  args: {
    userId: appUserIdValidator,
    kind: providerKindValidator,
  },
  returns: union(providerConnectionResultValidator, vNull()),
  handler: async (ctx, args) => {
    return await getConnectionByUserAndKind(ctx.db, args.userId, args.kind);
  },
});

export const listByUser = query({
  args: {
    userId: appUserIdValidator,
  },
  returns: array(providerConnectionResultValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("providerConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return rows.sort((left, right) => left.kind.localeCompare(right.kind));
  },
});

export const getCreateAvailability = query({
  args: {
    userId: appUserIdValidator,
  },
  returns: object({
    githubConnected: boolean(),
    convexConnected: boolean(),
    cloudflareConnected: boolean(),
  }),
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("providerConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      githubConnected: connections.some(
        (connection) => connection.kind === "github",
      ),
      convexConnected: connections.some(
        (connection) => connection.kind === "convex",
      ),
      cloudflareConnected: connections.some(
        (connection) => connection.kind === "cloudflare",
      ),
    };
  },
});

export const upsertGithub = mutation({
  args: githubConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertGithubConnection(ctx.db, args);
    return null;
  },
});

export const upsertConvex = mutation({
  args: convexConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertConvexConnection(ctx.db, args);
    return null;
  },
});

export const upsertCloudflare = mutation({
  args: cloudflareConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertCloudflareConnection(ctx.db, args);
    return null;
  },
});

export const deleteByUserAndKind = mutation({
  args: {
    userId: appUserIdValidator,
    kind: providerKindValidator,
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const existing = await getConnectionByUserAndKind(
      ctx.db,
      args.userId,
      args.kind,
    );
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const createOauthState = mutation({
  args: {
    provider: oauthProviderValidator,
    userId: appUserIdValidator,
    state: string(),
    returnToPath: optional(string()),
    codeVerifier: optional(string()),
    clientId: optional(string()),
    clientSecret: optional(string()),
    createdAt: number(),
    expiresAt: number(),
  },
  returns: id("oauthStates"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("oauthStates", args);
  },
});

export const getOauthStateByState = query({
  args: {
    provider: oauthProviderValidator,
    state: string(),
  },
  returns: union(oauthStateResultValidator, vNull()),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (record?.provider !== args.provider) {
      return null;
    }
    return record;
  },
});

export const deleteOauthState = mutation({
  args: {
    id: id("oauthStates"),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});
