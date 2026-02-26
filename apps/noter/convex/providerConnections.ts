import { Infer, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const providerKindValidator = v.union(
  v.literal("github"),
  v.literal("convex"),
  v.literal("netlify"),
);
export type ProviderKind = Infer<typeof providerKindValidator>;

const oauthAuthValidator = v.object({
  method: v.literal("oauth"),
  credential: v.string(),
  refreshCredential: v.optional(v.string()),
  credentialExpiresAt: v.optional(v.number()),
});
const apiKeyAuthValidator = v.object({
  method: v.literal("api_key"),
  credential: v.string(),
  credentialExpiresAt: v.optional(v.number()),
});
const providerAuthValidator = v.union(oauthAuthValidator, apiKeyAuthValidator);
export type ProviderAuth = Infer<typeof providerAuthValidator>;

const githubConnectionUpsertValidator = v.object({
  userId: v.id("users"),
  auth: providerAuthValidator,
  username: v.optional(v.string()),
});
const convexConnectionUpsertValidator = v.object({
  userId: v.id("users"),
  auth: providerAuthValidator,
  teamId: v.string(),
  teamSlug: v.optional(v.string()),
});
const netlifyConnectionUpsertValidator = v.object({
  userId: v.id("users"),
  auth: providerAuthValidator,
  teamId: v.string(),
  teamSlug: v.optional(v.string()),
});

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
    username: args.username,
    createdAt: now,
    updatedAt: now,
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
    teamSlug: args.teamSlug,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertNetlifyConnection(
  db: DatabaseWriter,
  args: Infer<typeof netlifyConnectionUpsertValidator>,
): Promise<void> {
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(db, args.userId, "netlify");
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
    kind: "netlify",
    userId: args.userId,
    auth: args.auth,
    teamId: args.teamId,
    teamSlug: args.teamSlug,
    createdAt: now,
    updatedAt: now,
  });
}

export const getByUserAndKind = internalQuery({
  args: {
    userId: v.id("users"),
    kind: providerKindValidator,
  },
  returns: v.union(
    v.object({
      _id: v.id("providerConnections"),
      _creationTime: v.number(),
      kind: v.literal("github"),
      userId: v.id("users"),
      auth: providerAuthValidator,
      username: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.object({
      _id: v.id("providerConnections"),
      _creationTime: v.number(),
      kind: v.literal("convex"),
      userId: v.id("users"),
      auth: providerAuthValidator,
      teamId: v.string(),
      teamSlug: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.object({
      _id: v.id("providerConnections"),
      _creationTime: v.number(),
      kind: v.literal("netlify"),
      userId: v.id("users"),
      auth: providerAuthValidator,
      teamId: v.string(),
      teamSlug: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await getConnectionByUserAndKind(ctx.db, args.userId, args.kind);
  },
});

export const listByUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.array(
    v.union(
      v.object({
        _id: v.id("providerConnections"),
        _creationTime: v.number(),
        kind: v.literal("github"),
        userId: v.id("users"),
        auth: providerAuthValidator,
        username: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
      v.object({
        _id: v.id("providerConnections"),
        _creationTime: v.number(),
        kind: v.literal("convex"),
        userId: v.id("users"),
        auth: providerAuthValidator,
        teamId: v.string(),
        teamSlug: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
      v.object({
        _id: v.id("providerConnections"),
        _creationTime: v.number(),
        kind: v.literal("netlify"),
        userId: v.id("users"),
        auth: providerAuthValidator,
        teamId: v.string(),
        teamSlug: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const upsertGithub = internalMutation({
  args: githubConnectionUpsertValidator,
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertGithubConnection(ctx.db, args);
    return null;
  },
});

export const upsertConvex = internalMutation({
  args: convexConnectionUpsertValidator,
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertConvexConnection(ctx.db, args);
    return null;
  },
});

export const upsertNetlify = internalMutation({
  args: netlifyConnectionUpsertValidator,
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertNetlifyConnection(ctx.db, args);
    return null;
  },
});

export const removeByUserAndKind = internalMutation({
  args: {
    userId: v.id("users"),
    kind: providerKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteConnectionByUserAndKind(ctx.db, args.userId, args.kind);
    return null;
  },
});
