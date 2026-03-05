import { Infer, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mcpTokenHealthValidator } from "./mcpTokenHealth";

const {
  array,
  id,
  literal,
  null: vNull,
  number,
  object,
  optional,
  string,
  union,
} = v;

const providerKindValidator = union(
  literal("github"),
  literal("convex"),
  literal("netlify"),
  literal("railway"),
  literal("cloudflare"),
);
export type ProviderKind = Infer<typeof providerKindValidator>;

const oauthAuthValidator = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
});
const mcpOauthAuthValidator = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
  mcpServerUrl: string(),
});
const apiKeyAuthValidator = object({
  method: literal("api_key"),
  credential: string(),
  credentialExpiresAt: optional(number()),
});
const providerAuthValidator = union(
  oauthAuthValidator,
  mcpOauthAuthValidator,
  apiKeyAuthValidator,
);
export type ProviderAuth = Infer<typeof providerAuthValidator>;

const standardProviderAuthValidator = union(
  oauthAuthValidator,
  apiKeyAuthValidator,
);
const cloudflareProviderAuthValidator = union(
  mcpOauthAuthValidator,
  apiKeyAuthValidator,
);

const githubConnectionUpsertValidator = object({
  userId: id("users"),
  auth: standardProviderAuthValidator,
  username: optional(string()),
});
const convexConnectionUpsertValidator = object({
  userId: id("users"),
  auth: standardProviderAuthValidator,
  teamId: string(),
  teamSlug: optional(string()),
});
const netlifyConnectionUpsertValidator = object({
  userId: id("users"),
  auth: standardProviderAuthValidator,
  teamId: string(),
  teamSlug: optional(string()),
});
const railwayConnectionUpsertValidator = object({
  userId: id("users"),
  auth: standardProviderAuthValidator,
  accountId: string(),
  email: optional(string()),
  name: optional(string()),
});
const cloudflareConnectionUpsertValidator = object({
  userId: id("users"),
  auth: cloudflareProviderAuthValidator,
  accountId: optional(string()),
  tokenHealth: optional(mcpTokenHealthValidator),
});

const githubConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("github"),
  userId: id("users"),
  auth: standardProviderAuthValidator,
  username: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const convexConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("convex"),
  userId: id("users"),
  auth: standardProviderAuthValidator,
  teamId: string(),
  teamSlug: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const netlifyConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("netlify"),
  userId: id("users"),
  auth: standardProviderAuthValidator,
  teamId: string(),
  teamSlug: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const railwayConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("railway"),
  userId: id("users"),
  auth: standardProviderAuthValidator,
  accountId: string(),
  email: optional(string()),
  name: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
const cloudflareConnectionResultValidator = object({
  _id: id("providerConnections"),
  _creationTime: number(),
  kind: literal("cloudflare"),
  userId: id("users"),
  auth: cloudflareProviderAuthValidator,
  accountId: optional(string()),
  tokenHealth: optional(mcpTokenHealthValidator),
  createdAt: number(),
  updatedAt: number(),
});
const providerConnectionResultValidator = union(
  githubConnectionResultValidator,
  convexConnectionResultValidator,
  netlifyConnectionResultValidator,
  railwayConnectionResultValidator,
  cloudflareConnectionResultValidator,
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

async function upsertRailwayConnection(
  db: DatabaseWriter,
  args: Infer<typeof railwayConnectionUpsertValidator>,
): Promise<void> {
  const now = Date.now();
  const existing = await getConnectionByUserAndKind(db, args.userId, "railway");
  if (existing) {
    await db.patch(existing._id, {
      auth: args.auth,
      accountId: args.accountId,
      email: args.email,
      name: args.name,
      updatedAt: now,
    });
    return;
  }
  await db.insert("providerConnections", {
    kind: "railway",
    userId: args.userId,
    auth: args.auth,
    accountId: args.accountId,
    email: args.email,
    name: args.name,
    createdAt: now,
    updatedAt: now,
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
    const patch: {
      auth: Infer<typeof cloudflareProviderAuthValidator>;
      accountId?: string;
      tokenHealth?: Infer<typeof mcpTokenHealthValidator>;
      updatedAt: number;
    } = {
      auth: args.auth,
      accountId: args.accountId,
      updatedAt: now,
    };
    if (args.tokenHealth !== undefined) {
      patch.tokenHealth = args.tokenHealth;
    }
    await db.patch(existing._id, patch);
    return;
  }
  const doc: {
    kind: "cloudflare";
    userId: Id<"users">;
    auth: Infer<typeof cloudflareProviderAuthValidator>;
    accountId?: string;
    tokenHealth?: Infer<typeof mcpTokenHealthValidator>;
    createdAt: number;
    updatedAt: number;
  } = {
    kind: "cloudflare",
    userId: args.userId,
    auth: args.auth,
    accountId: args.accountId,
    createdAt: now,
    updatedAt: now,
  };
  if (args.tokenHealth !== undefined) {
    doc.tokenHealth = args.tokenHealth;
  }
  await db.insert("providerConnections", doc);
}

export const getByUserAndKind = internalQuery({
  args: {
    userId: id("users"),
    kind: providerKindValidator,
  },
  returns: union(providerConnectionResultValidator, vNull()),
  handler: async (ctx, args) => {
    return await getConnectionByUserAndKind(ctx.db, args.userId, args.kind);
  },
});

export const listByUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: array(providerConnectionResultValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const upsertGithub = internalMutation({
  args: githubConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertGithubConnection(ctx.db, args);
    return null;
  },
});

export const upsertConvex = internalMutation({
  args: convexConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertConvexConnection(ctx.db, args);
    return null;
  },
});

export const upsertNetlify = internalMutation({
  args: netlifyConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertNetlifyConnection(ctx.db, args);
    return null;
  },
});

export const upsertRailway = internalMutation({
  args: railwayConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertRailwayConnection(ctx.db, args);
    return null;
  },
});

export const upsertCloudflare = internalMutation({
  args: cloudflareConnectionUpsertValidator,
  returns: vNull(),
  handler: async (ctx, args) => {
    await upsertCloudflareConnection(ctx.db, args);
    return null;
  },
});

export const removeByUserAndKind = internalMutation({
  args: {
    userId: id("users"),
    kind: providerKindValidator,
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await deleteConnectionByUserAndKind(ctx.db, args.userId, args.kind);
    return null;
  },
});
