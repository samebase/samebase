import { Infer, v } from "convex/values";

import { internalMutation, internalQuery, type DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { vMcpTokenHealth } from "./mcpTokenHealth";
import {
  requireOrganizationAccessContext,
  requireOrganizationMembership,
} from "./organizationAccess";
import {
  vCloudflareDefaultAccount,
  vCloudflareProviderAuth,
  vCloudflareProviderConnection,
  vConvexProviderConnection,
  vProviderAuth,
  vProviderConnectionTarget,
  vProviderKind,
  vStandardProviderAuth,
  providerConnectionTargetMatches,
  providerAuthMatches,
  type ProviderConnection,
  type ProviderKind,
} from "./providerConnectionModel";
import { fingerprintProviderAuth } from "./providerAuthFingerprint";
import { assertProviderTargetCanBeEstablished } from "./providerConnectionTargetSafety";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
} from "../shared/cloudflareTokenRefresh";

const { array, boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

const vProviderConnectionResult = union(
  vConvexProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vCloudflareProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
);

const vConvexConnectionWrite = object({
  kind: literal("convex"),
  auth: vStandardProviderAuth,
  teamId: string(),
  teamSlug: optional(string()),
});
const vCloudflareConnectionWrite = object({
  kind: literal("cloudflare"),
  auth: vCloudflareProviderAuth,
  defaultAccount: vCloudflareDefaultAccount,
  tokenHealth: optional(vMcpTokenHealth),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
});
const vConnectionWrite = union(vConvexConnectionWrite, vCloudflareConnectionWrite);
type ConnectionWrite = Infer<typeof vConnectionWrite>;

async function assertConnectionTargetCanBeEstablished(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; connection: ConnectionWrite },
): Promise<void> {
  switch (args.connection.kind) {
    case "convex":
      await assertProviderTargetCanBeEstablished(db, {
        organizationId: args.organizationId,
        target: { kind: "convex", teamId: args.connection.teamId },
      });
      return;
    case "cloudflare":
      if (args.connection.defaultAccount.state === "selected") {
        await assertProviderTargetCanBeEstablished(db, {
          organizationId: args.organizationId,
          target: {
            kind: "cloudflare",
            accountId: args.connection.defaultAccount.accountId,
          },
        });
      }
      return;
  }
}

async function requireActiveOrganizationConnectionMember(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<Doc<"organizationMemberships">> {
  const [user, organization] = await Promise.all([
    db.get(args.userId),
    db.get(args.organizationId),
  ]);
  if (user === null || user.accountDeletion !== undefined) {
    throw new Error("Provider connections are unavailable during account deletion.");
  }
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  return await requireOrganizationMembership(db, args);
}

async function requireActiveOrganizationConnectionOwner(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<void> {
  const membership = await requireActiveOrganizationConnectionMember(db, args);
  if (membership.role !== "owner") {
    throw new Error("Organization owner access is required.");
  }
}

function buildProviderConnection(args: {
  organizationId: Id<"organizations">;
  connectedByUserId: Id<"users">;
  connection: ConnectionWrite;
  createdAt: number;
  updatedAt: number;
}): ProviderConnection {
  const identity = {
    organizationId: args.organizationId,
    connectedByUserId: args.connectedByUserId,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
  };
  switch (args.connection.kind) {
    case "convex":
      return { ...identity, ...args.connection };
    case "cloudflare":
      return { ...identity, ...args.connection };
  }
}

function resolveCloudflareDefaultAccount(
  existing: Extract<Doc<"providerConnections">, { kind: "cloudflare" }>["defaultAccount"],
  replacement: Extract<ConnectionWrite, { kind: "cloudflare" }>["defaultAccount"],
) {
  if (existing.state === "not_selected") {
    return replacement;
  }
  if (replacement.state === "not_selected") {
    return existing;
  }
  if (existing.accountId !== replacement.accountId) {
    throw new Error("Cloudflare connection account cannot change.");
  }
  return replacement;
}

function resolveReplacementConnection(
  existing: Doc<"providerConnections">,
  replacement: ConnectionWrite,
): ConnectionWrite {
  switch (existing.kind) {
    case "convex":
      if (replacement.kind !== "convex") {
        throw new Error("Provider connection kind cannot change.");
      }
      if (existing.teamId !== replacement.teamId) {
        throw new Error("Convex connection team cannot change.");
      }
      return replacement;
    case "cloudflare":
      if (replacement.kind !== "cloudflare") {
        throw new Error("Provider connection kind cannot change.");
      }
      return {
        ...replacement,
        defaultAccount: resolveCloudflareDefaultAccount(
          existing.defaultAccount,
          replacement.defaultAccount,
        ),
      };
  }
}

export async function getProviderConnectionForOrganization(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    kind: ProviderKind;
  },
): Promise<Doc<"providerConnections"> | null> {
  const connections = await db
    .query("providerConnections")
    .withIndex("by_organization_and_kind", (query) =>
      query.eq("organizationId", args.organizationId).eq("kind", args.kind),
    )
    .take(2);
  if (connections.length > 1) {
    throw new Error(
      `Organization has multiple ${args.kind} provider connections. Reset provider connections and retry.`,
    );
  }
  return connections[0] ?? null;
}

export async function getProviderConnectionByIdForOrganization(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    kind: ProviderKind;
  },
): Promise<Doc<"providerConnections"> | null> {
  const connection = await getProviderConnectionForOrganization(db, args);
  return connection?._id === args.providerConnectionId ? connection : null;
}

export async function getConvexProviderConnectionForTeam(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; teamId: string },
) {
  const connection = await getProviderConnectionForOrganization(db, {
    organizationId: args.organizationId,
    kind: "convex",
  });
  return connection?.kind === "convex" && connection.teamId === args.teamId ? connection : null;
}

export async function getCloudflareProviderConnectionForAccount(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; accountId: string },
): Promise<Extract<Doc<"providerConnections">, { kind: "cloudflare" }> | null> {
  const connection = await getProviderConnectionForOrganization(db, {
    organizationId: args.organizationId,
    kind: "cloudflare",
  });
  return connection?.kind === "cloudflare" &&
    connection.defaultAccount.state === "selected" &&
    connection.defaultAccount.accountId === args.accountId
    ? connection
    : null;
}

export const loadForOrganization = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    kind: vProviderKind,
  },
  returns: union(vProviderConnectionResult, vNull()),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    return await getProviderConnectionForOrganization(ctx.db, args);
  },
});

export const loadByIdForOrganization = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
    kind: vProviderKind,
  },
  returns: union(vProviderConnectionResult, vNull()),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    return await getProviderConnectionByIdForOrganization(ctx.db, args);
  },
});

export const loadConvexForOrganizationTeam = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    teamId: string(),
  },
  returns: union(
    vConvexProviderConnection.extend({
      _id: id("providerConnections"),
      _creationTime: number(),
    }),
    vNull(),
  ),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    return await getConvexProviderConnectionForTeam(ctx.db, args);
  },
});

export const loadCloudflareForOrganizationAccount = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    accountId: string(),
  },
  returns: union(
    vCloudflareProviderConnection.extend({
      _id: id("providerConnections"),
      _creationTime: number(),
    }),
    vNull(),
  ),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    return await getCloudflareProviderConnectionForAccount(ctx.db, args);
  },
});

export const listByConnectedByUserId = internalQuery({
  args: {
    connectedByUserId: id("users"),
  },
  returns: array(vProviderConnectionResult),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerConnections")
      .withIndex("by_connected_by_user", (query) =>
        query.eq("connectedByUserId", args.connectedByUserId),
      )
      .order("asc")
      .take(100);
  },
});

export const createConnected = internalMutation({
  args: {
    organizationId: id("organizations"),
    connectedByUserId: id("users"),
    connection: vConnectionWrite,
  },
  returns: id("providerConnections"),
  handler: async (ctx, args) => {
    await requireActiveOrganizationConnectionOwner(ctx.db, {
      organizationId: args.organizationId,
      userId: args.connectedByUserId,
    });
    const existing = await getProviderConnectionForOrganization(ctx.db, {
      organizationId: args.organizationId,
      kind: args.connection.kind,
    });
    if (existing !== null) {
      throw new Error("Provider connection already exists. Reauthorize it instead.");
    }
    await assertConnectionTargetCanBeEstablished(ctx.db, args);
    const now = Date.now();
    return await ctx.db.insert(
      "providerConnections",
      buildProviderConnection({ ...args, createdAt: now, updatedAt: now }),
    );
  },
});

export const reauthorizeConnected = internalMutation({
  args: {
    organizationId: id("organizations"),
    connectedByUserId: id("users"),
    providerConnectionId: id("providerConnections"),
    expectedAuthFingerprint: string(),
    expectedTarget: vProviderConnectionTarget,
    connection: vConnectionWrite,
  },
  returns: id("providerConnections"),
  handler: async (ctx, args) => {
    await requireActiveOrganizationConnectionOwner(ctx.db, {
      organizationId: args.organizationId,
      userId: args.connectedByUserId,
    });
    const existing = await getProviderConnectionByIdForOrganization(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: args.connection.kind,
    });
    if (existing === null) {
      throw new Error("Provider connection not found.");
    }
    if ((await fingerprintProviderAuth(existing.auth)) !== args.expectedAuthFingerprint) {
      throw new Error("Provider connection changed before reauthorization completed.");
    }
    if (!providerConnectionTargetMatches(existing, args.expectedTarget)) {
      throw new Error("Provider connection target changed before reauthorization completed.");
    }
    const replacement = resolveReplacementConnection(existing, args.connection);
    if (
      existing.kind === "cloudflare" &&
      existing.defaultAccount.state === "not_selected" &&
      replacement.kind === "cloudflare" &&
      replacement.defaultAccount.state === "selected"
    ) {
      await assertConnectionTargetCanBeEstablished(ctx.db, {
        organizationId: args.organizationId,
        connection: replacement,
      });
    }
    await ctx.db.replace(
      existing._id,
      buildProviderConnection({
        organizationId: existing.organizationId,
        connectedByUserId: args.connectedByUserId,
        connection: replacement,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      }),
    );
    return existing._id;
  },
});

export const setConvexTeamSlug = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
    teamId: string(),
    teamSlug: string(),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await requireActiveOrganizationConnectionMember(ctx.db, args);
    const connection = await getProviderConnectionByIdForOrganization(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "convex",
    });
    if (connection?.kind !== "convex" || connection.teamId !== args.teamId) {
      throw new Error("Convex connection changed before team slug update.");
    }
    await ctx.db.patch(connection._id, {
      teamSlug: args.teamSlug,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateCloudflareConnected = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
    expectedAuth: vCloudflareProviderAuth,
    auth: vCloudflareProviderAuth,
    defaultAccount: vCloudflareDefaultAccount,
    tokenHealth: optional(vMcpTokenHealth),
    tokenRefreshStartedAt: optional(number()),
    lastTokenRefreshAt: optional(number()),
    expectedTokenRefreshStartedAt: optional(number()),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const membership = await requireActiveOrganizationConnectionMember(ctx.db, args);
    const connection = await getProviderConnectionByIdForOrganization(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "cloudflare",
    });
    if (connection?.kind !== "cloudflare") {
      throw new Error("Cloudflare connection not found.");
    }
    if (!providerAuthMatches(connection.auth, args.expectedAuth)) {
      throw new Error("Cloudflare connection changed before the update completed.");
    }
    if (
      args.expectedTokenRefreshStartedAt !== undefined &&
      connection.tokenRefreshStartedAt !== args.expectedTokenRefreshStartedAt
    ) {
      throw new Error("Cloudflare token refresh lease changed before the update completed.");
    }
    const defaultAccount = resolveCloudflareDefaultAccount(
      connection.defaultAccount,
      args.defaultAccount,
    );
    const defaultAccountChanged =
      connection.defaultAccount.state !== defaultAccount.state ||
      (connection.defaultAccount.state === "selected" &&
        defaultAccount.state === "selected" &&
        connection.defaultAccount.accountId !== defaultAccount.accountId);
    if (connection.defaultAccount.state === "not_selected" && defaultAccount.state === "selected") {
      await assertConnectionTargetCanBeEstablished(ctx.db, {
        organizationId: args.organizationId,
        connection: {
          kind: "cloudflare",
          auth: args.auth,
          defaultAccount,
        },
      });
    }
    if (defaultAccountChanged) {
      if (membership.role !== "owner") {
        throw new Error("Organization owner access is required.");
      }
    }
    await ctx.db.patch(connection._id, {
      auth: args.auth,
      defaultAccount,
      updatedAt: Date.now(),
      ...(args.tokenHealth !== undefined ? { tokenHealth: args.tokenHealth } : {}),
      ...(args.tokenRefreshStartedAt !== undefined
        ? { tokenRefreshStartedAt: args.tokenRefreshStartedAt }
        : {}),
      ...(args.lastTokenRefreshAt !== undefined
        ? { lastTokenRefreshAt: args.lastTokenRefreshAt }
        : {}),
    });
    return null;
  },
});

export const disconnect = internalMutation({
  args: {
    organizationId: id("organizations"),
    disconnectedByUserId: id("users"),
    providerConnectionId: id("providerConnections"),
    kind: vProviderKind,
    expectedAuth: vProviderAuth,
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await requireActiveOrganizationConnectionOwner(ctx.db, {
      organizationId: args.organizationId,
      userId: args.disconnectedByUserId,
    });
    const connection = await getProviderConnectionByIdForOrganization(ctx.db, args);
    if (connection === null) {
      throw new Error("Provider connection not found.");
    }
    if (!providerAuthMatches(connection.auth, args.expectedAuth)) {
      throw new Error("Provider connection changed before disconnect completed.");
    }
    await ctx.db.delete(connection._id);
    return null;
  },
});

export const claimCloudflareTokenRefresh = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
    expectedAuth: vCloudflareProviderAuth,
    force: optional(boolean()),
    debounceMs: optional(number()),
  },
  returns: union(
    object({
      claimed: literal(true),
      tokenRefreshStartedAt: number(),
    }),
    object({
      claimed: literal(false),
      nextAllowedRefreshAt: optional(number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireActiveOrganizationConnectionMember(ctx.db, args);
    const connection = await getProviderConnectionByIdForOrganization(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "cloudflare",
    });
    if (connection?.kind !== "cloudflare") {
      return { claimed: false as const };
    }
    if (!providerAuthMatches(connection.auth, args.expectedAuth)) {
      throw new Error("Cloudflare connection changed before token refresh claim.");
    }
    if (connection.auth.method !== "oauth" && connection.auth.method !== "mcp_oauth") {
      return { claimed: false as const };
    }
    const now = Date.now();
    const debounceMs =
      args.debounceMs === undefined
        ? CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS
        : Math.max(0, Math.floor(args.debounceMs));
    if (
      connection.tokenRefreshStartedAt !== undefined &&
      now - connection.tokenRefreshStartedAt < CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS
    ) {
      return {
        claimed: false as const,
        nextAllowedRefreshAt:
          connection.tokenRefreshStartedAt + CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
      };
    }
    if (
      !args.force &&
      connection.lastTokenRefreshAt !== undefined &&
      now - connection.lastTokenRefreshAt < debounceMs
    ) {
      return {
        claimed: false as const,
        nextAllowedRefreshAt: connection.lastTokenRefreshAt + debounceMs,
      };
    }
    await ctx.db.patch(connection._id, { tokenRefreshStartedAt: now, updatedAt: now });
    return { claimed: true as const, tokenRefreshStartedAt: now };
  },
});

export const releaseCloudflareTokenRefresh = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
    expectedAuth: vCloudflareProviderAuth,
    expectedTokenRefreshStartedAt: number(),
    recordLastTokenRefreshAt: optional(boolean()),
  },
  returns: object({
    lastTokenRefreshAt: optional(number()),
  }),
  handler: async (ctx, args) => {
    await requireActiveOrganizationConnectionMember(ctx.db, args);
    const connection = await getProviderConnectionByIdForOrganization(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "cloudflare",
    });
    if (connection?.kind !== "cloudflare") {
      return {};
    }
    if (!providerAuthMatches(connection.auth, args.expectedAuth)) {
      throw new Error("Cloudflare connection changed before token refresh release.");
    }
    if (connection.auth.method !== "oauth" && connection.auth.method !== "mcp_oauth") {
      return {};
    }
    if (connection.tokenRefreshStartedAt !== args.expectedTokenRefreshStartedAt) {
      throw new Error("Cloudflare token refresh lease changed before release.");
    }
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      tokenRefreshStartedAt: undefined,
      ...(args.recordLastTokenRefreshAt ? { lastTokenRefreshAt: now } : {}),
      updatedAt: now,
    });
    return args.recordLastTokenRefreshAt ? { lastTokenRefreshAt: now } : {};
  },
});
