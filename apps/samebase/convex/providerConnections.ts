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
  requireOrganizationAccessContext,
  requireOrganizationMembership,
} from "./organizationAccess";
import {
  vCloudflareDefaultAccount,
  vCloudflareProviderAuth,
  vCloudflareProviderConnection,
  vConvexProviderConnection,
  vProviderKind,
  vStandardProviderAuth,
  type ProviderConnection,
  type ProviderKind,
} from "./providerConnectionModel";
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

function readSelectedProviderConnectionId(
  organization: Doc<"organizations">,
  kind: ProviderKind,
): Id<"providerConnections"> | undefined {
  switch (kind) {
    case "convex":
      return organization.selectedConvexProviderConnectionId;
    case "cloudflare":
      return organization.selectedCloudflareProviderConnectionId;
  }
}

async function patchSelectedProviderConnection(
  db: DatabaseWriter,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    kind: ProviderKind;
  },
): Promise<void> {
  switch (args.kind) {
    case "convex":
      await db.patch(args.organizationId, {
        selectedConvexProviderConnectionId: args.providerConnectionId,
      });
      return;
    case "cloudflare":
      await db.patch(args.organizationId, {
        selectedCloudflareProviderConnectionId: args.providerConnectionId,
      });
  }
}

async function clearSelectedProviderConnectionIfMatching(
  db: DatabaseWriter,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    kind: ProviderKind;
  },
): Promise<void> {
  const organization = await db.get(args.organizationId);
  if (
    organization === null ||
    readSelectedProviderConnectionId(organization, args.kind) !== args.providerConnectionId
  ) {
    return;
  }
  switch (args.kind) {
    case "convex":
      await db.patch(args.organizationId, { selectedConvexProviderConnectionId: undefined });
      return;
    case "cloudflare":
      await db.patch(args.organizationId, { selectedCloudflareProviderConnectionId: undefined });
  }
}

export async function getProviderConnectionByIdForOrganization(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    kind: ProviderKind;
  },
): Promise<Doc<"providerConnections"> | null> {
  const connection = await db.get(args.providerConnectionId);
  if (
    connection === null ||
    connection.organizationId !== args.organizationId ||
    connection.kind !== args.kind
  ) {
    return null;
  }
  return connection;
}

export async function getSelectedProviderConnectionForOrganization(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    kind: ProviderKind;
  },
): Promise<Doc<"providerConnections"> | null> {
  const organization = await db.get(args.organizationId);
  if (organization === null) {
    return null;
  }
  const providerConnectionId = readSelectedProviderConnectionId(organization, args.kind);
  if (providerConnectionId === undefined) {
    return null;
  }
  return await getProviderConnectionByIdForOrganization(db, {
    ...args,
    providerConnectionId,
  });
}

export const loadSelectedForOrganization = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    kind: vProviderKind,
  },
  returns: union(vProviderConnectionResult, vNull()),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    return await getSelectedProviderConnectionForOrganization(ctx.db, args);
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
    const now = Date.now();
    const providerConnectionId = await ctx.db.insert(
      "providerConnections",
      buildProviderConnection({ ...args, createdAt: now, updatedAt: now }),
    );
    await patchSelectedProviderConnection(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId,
      kind: args.connection.kind,
    });
    return providerConnectionId;
  },
});

export const reauthorizeConnected = internalMutation({
  args: {
    organizationId: id("organizations"),
    connectedByUserId: id("users"),
    providerConnectionId: id("providerConnections"),
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
    if (
      existing.kind === "convex" &&
      args.connection.kind === "convex" &&
      existing.teamId !== args.connection.teamId
    ) {
      throw new Error("Convex connection team cannot change during reauthorization.");
    }
    await ctx.db.replace(
      existing._id,
      buildProviderConnection({
        organizationId: existing.organizationId,
        connectedByUserId: args.connectedByUserId,
        connection: args.connection,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      }),
    );
    await patchSelectedProviderConnection(ctx.db, {
      organizationId: existing.organizationId,
      providerConnectionId: existing._id,
      kind: existing.kind,
    });
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
    auth: vCloudflareProviderAuth,
    defaultAccount: vCloudflareDefaultAccount,
    tokenHealth: optional(vMcpTokenHealth),
    tokenRefreshStartedAt: optional(number()),
    lastTokenRefreshAt: optional(number()),
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
    const defaultAccountChanged =
      connection.defaultAccount.state !== args.defaultAccount.state ||
      (connection.defaultAccount.state === "selected" &&
        args.defaultAccount.state === "selected" &&
        connection.defaultAccount.accountId !== args.defaultAccount.accountId);
    if (defaultAccountChanged) {
      if (membership.role !== "owner") {
        throw new Error("Organization owner access is required.");
      }
    }
    await ctx.db.patch(connection._id, {
      auth: args.auth,
      defaultAccount: args.defaultAccount,
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
    await clearSelectedProviderConnectionIfMatching(ctx.db, args);
    await ctx.db.delete(connection._id);
    return null;
  },
});

export const claimCloudflareTokenRefresh = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
    force: optional(boolean()),
    debounceMs: optional(number()),
  },
  returns: object({
    claimed: boolean(),
    nextAllowedRefreshAt: optional(number()),
  }),
  handler: async (ctx, args) => {
    await requireActiveOrganizationConnectionMember(ctx.db, args);
    const connection = await getProviderConnectionByIdForOrganization(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "cloudflare",
    });
    if (connection?.kind !== "cloudflare" || connection.auth.method !== "mcp_oauth") {
      return { claimed: false };
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
        claimed: false,
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
        claimed: false,
        nextAllowedRefreshAt: connection.lastTokenRefreshAt + debounceMs,
      };
    }
    await ctx.db.patch(connection._id, { tokenRefreshStartedAt: now, updatedAt: now });
    return { claimed: true };
  },
});

export const releaseCloudflareTokenRefresh = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
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
    if (connection?.kind !== "cloudflare" || connection.auth.method !== "mcp_oauth") {
      return {};
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
