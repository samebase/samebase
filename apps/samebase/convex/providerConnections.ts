import { Infer, v } from "convex/values";

import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrganizationAccessContext } from "./organizationAccess";
import {
  vCloudflareDefaultAccount,
  vCloudflareProviderAuth,
  vConnectedCloudflareProviderConnection,
  vConnectedConvexProviderConnection,
  vConnectedGithubProviderConnection,
  vDisconnectedCloudflareProviderConnection,
  vDisconnectedConvexProviderConnection,
  vDisconnectedGithubProviderConnection,
  vProviderConnection,
  vProviderKind,
  vStandardProviderAuth,
  type CloudflareDefaultAccount,
  type ConnectedProviderConnection,
  type ProviderKind,
} from "./providerConnectionModel";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
} from "../shared/cloudflareTokenRefresh";
import { vMcpTokenHealth } from "./mcpTokenHealth";

const { array, boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

const vProviderConnectionResult = union(
  vConnectedGithubProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vDisconnectedGithubProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vConnectedConvexProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vDisconnectedConvexProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vConnectedCloudflareProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vDisconnectedCloudflareProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
);
const vConnectedProviderConnectionResult = union(
  vConnectedGithubProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vConnectedConvexProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
  vConnectedCloudflareProviderConnection.extend({
    _id: id("providerConnections"),
    _creationTime: number(),
  }),
);

const vGithubConnectionWrite = object({
  kind: literal("github"),
  auth: vStandardProviderAuth,
  accountId: string(),
  username: optional(string()),
});
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
const vConnectedConnectionWrite = union(
  vGithubConnectionWrite,
  vConvexConnectionWrite,
  vCloudflareConnectionWrite,
);
type ConnectedConnectionWrite = Infer<typeof vConnectedConnectionWrite>;

export function buildSeedCloudflareDefaultAccount(
  accountId: string | null | undefined,
): CloudflareDefaultAccount {
  const normalizedAccountId = accountId?.trim();
  if (!normalizedAccountId) {
    return { state: "not_selected" };
  }

  // The seed env only carries the account id. A later account list replaces
  // this display fallback with Cloudflare's current account name.
  return {
    state: "selected",
    accountId: normalizedAccountId,
    accountName: normalizedAccountId,
  };
}

async function assertActorCanWriteOrganizationConnection(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<void> {
  const user = await db.get(args.userId);
  if (user === null || user.accountDeletion !== undefined) {
    throw new Error("Provider connections are unavailable during account deletion.");
  }
  await requireOrganizationAccessContext(db, args);
}

function buildConnectedConnection(args: {
  organizationId: Id<"organizations">;
  connectedByUserId: Id<"users">;
  connection: ConnectedConnectionWrite;
  createdAt: number;
  updatedAt: number;
}): ConnectedProviderConnection {
  const identity = {
    organizationId: args.organizationId,
    connectedByUserId: args.connectedByUserId,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
    state: "connected" as const,
  };
  switch (args.connection.kind) {
    case "github":
      return { ...identity, ...args.connection };
    case "convex":
      return { ...identity, ...args.connection };
    case "cloudflare":
      return { ...identity, ...args.connection };
  }
}

function buildDisconnectedConnection(args: {
  connection: Doc<"providerConnections">;
  disconnectedAt: number;
}): Infer<typeof vProviderConnection> {
  const identity = {
    organizationId: args.connection.organizationId,
    connectedByUserId: args.connection.connectedByUserId,
    createdAt: args.connection.createdAt,
    updatedAt: args.disconnectedAt,
    state: "disconnected" as const,
    disconnectedAt: args.disconnectedAt,
  };
  switch (args.connection.kind) {
    case "github":
      return {
        ...identity,
        kind: "github",
        accountId: args.connection.accountId,
        username: args.connection.username,
      };
    case "convex":
      return {
        ...identity,
        kind: "convex",
        teamId: args.connection.teamId,
        teamSlug: args.connection.teamSlug,
      };
    case "cloudflare":
      return {
        ...identity,
        kind: "cloudflare",
        defaultAccount: args.connection.defaultAccount,
      };
  }
}

function readSelectedProviderConnectionId(
  organization: Doc<"organizations">,
  kind: ProviderKind,
): Id<"providerConnections"> | undefined {
  switch (kind) {
    case "github":
      return organization.selectedGithubProviderConnectionId;
    case "convex":
      return organization.selectedConvexProviderConnectionId;
    case "cloudflare":
      return organization.selectedCloudflareProviderConnectionId;
  }
}

export async function selectProviderConnection(
  db: DatabaseWriter,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    kind: ProviderKind;
  },
): Promise<void> {
  switch (args.kind) {
    case "github":
      await db.patch(args.organizationId, {
        selectedGithubProviderConnectionId: args.providerConnectionId,
      });
      return;
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

export async function getCurrentConnectedProviderConnection(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    kind: ProviderKind;
  },
): Promise<Extract<Doc<"providerConnections">, { state: "connected" }> | null> {
  const connection = await getDefaultProviderConnectionForOrganization(db, args);
  return connection?.state === "connected" ? connection : null;
}

export async function getDefaultProviderConnectionForOrganization(
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
  const connection = await db.get(providerConnectionId);
  if (
    connection === null ||
    connection.organizationId !== args.organizationId ||
    connection.kind !== args.kind
  ) {
    return null;
  }
  return connection;
}

export async function getConnectedProviderConnectionById(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
    kind: ProviderKind;
  },
): Promise<Extract<Doc<"providerConnections">, { state: "connected" }> | null> {
  const connection = await db.get(args.providerConnectionId);
  if (
    connection === null ||
    connection.organizationId !== args.organizationId ||
    connection.kind !== args.kind ||
    connection.state !== "connected"
  ) {
    return null;
  }
  return connection;
}

export const loadCurrentConnectedForOrganization = internalQuery({
  args: {
    organizationId: id("organizations"),
    kind: vProviderKind,
  },
  returns: union(vConnectedProviderConnectionResult, vNull()),
  handler: async (ctx, args) => {
    return await getCurrentConnectedProviderConnection(ctx.db, args);
  },
});

export const loadConnectedByIdForOrganization = internalQuery({
  args: {
    organizationId: id("organizations"),
    providerConnectionId: id("providerConnections"),
    kind: vProviderKind,
  },
  returns: union(vConnectedProviderConnectionResult, vNull()),
  handler: async (ctx, args) => {
    return await getConnectedProviderConnectionById(ctx.db, args);
  },
});

export const loadDefaultForOrganization = internalQuery({
  args: {
    organizationId: id("organizations"),
    kind: vProviderKind,
  },
  returns: union(vProviderConnectionResult, vNull()),
  handler: async (ctx, args) => {
    return await getDefaultProviderConnectionForOrganization(ctx.db, args);
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
      .take(100);
  },
});

export const createConnected = internalMutation({
  args: {
    organizationId: id("organizations"),
    connectedByUserId: id("users"),
    connection: vConnectedConnectionWrite,
  },
  returns: id("providerConnections"),
  handler: async (ctx, args) => {
    await assertActorCanWriteOrganizationConnection(ctx.db, {
      organizationId: args.organizationId,
      userId: args.connectedByUserId,
    });
    const now = Date.now();
    const providerConnectionId = await ctx.db.insert(
      "providerConnections",
      buildConnectedConnection({
        organizationId: args.organizationId,
        connectedByUserId: args.connectedByUserId,
        connection: args.connection,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await selectProviderConnection(ctx.db, {
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
    connection: vConnectedConnectionWrite,
  },
  returns: id("providerConnections"),
  handler: async (ctx, args) => {
    await assertActorCanWriteOrganizationConnection(ctx.db, {
      organizationId: args.organizationId,
      userId: args.connectedByUserId,
    });
    const existing = await ctx.db.get(args.providerConnectionId);
    if (
      existing === null ||
      existing.organizationId !== args.organizationId ||
      existing.kind !== args.connection.kind
    ) {
      throw new Error("Provider connection not found.");
    }
    if (
      existing.kind === "github" &&
      args.connection.kind === "github" &&
      existing.accountId !== args.connection.accountId
    ) {
      throw new Error("GitHub connection account cannot change during reauthorization.");
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
      buildConnectedConnection({
        organizationId: existing.organizationId,
        connectedByUserId: args.connectedByUserId,
        connection: args.connection,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      }),
    );
    await selectProviderConnection(ctx.db, {
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
    await assertActorCanWriteOrganizationConnection(ctx.db, args);
    const connection = await getConnectedProviderConnectionById(ctx.db, {
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

export const setGithubUsername = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    providerConnectionId: id("providerConnections"),
    accountId: string(),
    username: string(),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await assertActorCanWriteOrganizationConnection(ctx.db, args);
    const connection = await getConnectedProviderConnectionById(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "github",
    });
    if (connection?.kind !== "github" || connection.accountId !== args.accountId) {
      throw new Error("GitHub connection changed before username update.");
    }
    await ctx.db.patch(connection._id, {
      username: args.username,
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
    await assertActorCanWriteOrganizationConnection(ctx.db, args);
    const connection = await getConnectedProviderConnectionById(ctx.db, {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "cloudflare",
    });
    if (connection?.kind !== "cloudflare") {
      throw new Error("Cloudflare connection not found.");
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
    await assertActorCanWriteOrganizationConnection(ctx.db, {
      organizationId: args.organizationId,
      userId: args.disconnectedByUserId,
    });
    const connection = await getConnectedProviderConnectionById(ctx.db, args);
    if (connection === null) {
      throw new Error("Provider connection not found.");
    }
    await ctx.db.replace(
      connection._id,
      buildDisconnectedConnection({ connection, disconnectedAt: Date.now() }),
    );
    return null;
  },
});

export const disconnectForAccountDeletion = internalMutation({
  args: {
    connectedByUserId: id("users"),
    providerConnectionId: id("providerConnections"),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.providerConnectionId);
    if (connection === null || connection.connectedByUserId !== args.connectedByUserId) {
      throw new Error("Provider connection not found.");
    }
    if (connection.state === "connected") {
      await ctx.db.replace(
        connection._id,
        buildDisconnectedConnection({ connection, disconnectedAt: Date.now() }),
      );
    }
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
    await assertActorCanWriteOrganizationConnection(ctx.db, {
      organizationId: args.organizationId,
      userId: args.userId,
    });
    const connection = await getConnectedProviderConnectionById(ctx.db, {
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
    await assertActorCanWriteOrganizationConnection(ctx.db, {
      organizationId: args.organizationId,
      userId: args.userId,
    });
    const connection = await getConnectedProviderConnectionById(ctx.db, {
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
