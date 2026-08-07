import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type MutationCtx,
} from "./_generated/server";
import {
  requireOrganizationAccessContext,
  requireOrganizationMembership,
} from "./organizationAccess";
import { vOrganizationCloudflareAccount, vOrganizationConvexTeam } from "./organizationModel";
import {
  vCloudflareProviderCredential,
  vCloudflareTokenRefreshLease,
  vConvexProviderCredential,
  type ProviderOAuthStoreResult,
} from "./organizationProviderCredentialModel";
import {
  providerAuthMatches,
  vCloudflareProviderAuth,
  vStandardProviderAuth,
} from "./providerAuth";
import { vMcpTokenHealth } from "./mcpTokenHealth";
import { hashOrganizationProviderSnapshot } from "./providerAuthFingerprint";
import {
  CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS,
  CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
} from "../shared/cloudflareTokenRefresh";

const { boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

const vOrganizationProviderConfiguration = object({
  convexTeam: optional(vOrganizationConvexTeam),
  cloudflareAccount: optional(vOrganizationCloudflareAccount),
  convexCredential: optional(vConvexProviderCredential),
  cloudflareCredential: optional(vCloudflareProviderCredential),
});
export type OrganizationProviderConfiguration = Infer<typeof vOrganizationProviderConfiguration>;

const vCloudflareAuthorizedAccount = union(
  object({ state: literal("selection_required") }),
  object({
    state: literal("selected"),
    accountId: string(),
    accountName: string(),
  }),
);
export type CloudflareAuthorizedAccount = Infer<typeof vCloudflareAuthorizedAccount>;

export const vConnectedProviderCredential = union(
  object({
    provider: literal("convex"),
    organizationId: id("organizations"),
    credential: vConvexProviderCredential,
  }),
  object({
    provider: literal("cloudflare"),
    organizationId: id("organizations"),
    credential: vCloudflareProviderCredential,
  }),
);
export type ConnectedProviderCredential = Infer<typeof vConnectedProviderCredential>;

async function requireActiveOrganizationProviderMember(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<Doc<"organizationMemberships">> {
  const [user, organization] = await Promise.all([
    db.get(args.userId),
    db.get(args.organizationId),
  ]);
  if (user === null || user.accountDeletion !== undefined) {
    throw new Error("Provider credentials are unavailable during account deletion.");
  }
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  return await requireOrganizationMembership(db, args);
}

async function requireActiveOrganizationProviderOwner(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<void> {
  const membership = await requireActiveOrganizationProviderMember(db, args);
  if (membership.role !== "owner") {
    throw new Error("Organization owner access is required.");
  }
}

export async function getOrganizationProviderCredentials(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<Doc<"organizationProviderCredentials"> | null> {
  return await db
    .query("organizationProviderCredentials")
    .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
    .unique();
}

export async function getOrganizationProviderConfiguration(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
): Promise<OrganizationProviderConfiguration> {
  const organization = await db.get(organizationId);
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  const credentials = await getOrganizationProviderCredentials(db, organizationId);
  return {
    ...(organization.convexTeam ? { convexTeam: organization.convexTeam } : {}),
    ...(organization.cloudflareAccount
      ? { cloudflareAccount: organization.cloudflareAccount }
      : {}),
    ...(credentials?.convex ? { convexCredential: credentials.convex } : {}),
    ...(credentials?.cloudflare ? { cloudflareCredential: credentials.cloudflare } : {}),
  };
}

async function findActiveOrganizationProviderOwner(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<Doc<"organizations"> | null> {
  const [user, organization, membership] = await Promise.all([
    db.get(args.userId),
    db.get(args.organizationId),
    db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (query) =>
        query.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .unique(),
  ]);
  if (
    user === null ||
    user.accountDeletion !== undefined ||
    organization === null ||
    membership?.role !== "owner"
  ) {
    return null;
  }
  return organization;
}

async function requireOAuthStateForCredentialWrite(
  ctx: Pick<MutationCtx, "db">,
  args: {
    oauthStateId: Id<"providerOAuthCallbackStates"> | undefined;
    oauthState: string | undefined;
    expectedProvider: "convex" | "cloudflare" | "cloudflare_mcp" | null;
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    expectedProviderSnapshotHash: string;
  },
): Promise<Doc<"providerOAuthCallbackStates"> | null> {
  if (args.expectedProvider === null) {
    if (args.oauthStateId !== undefined || args.oauthState !== undefined) {
      throw new Error("API key connection cannot consume OAuth state.");
    }
    return null;
  }
  if (args.oauthStateId === undefined || args.oauthState === undefined) {
    throw new Error("OAuth state is required to store this provider credential.");
  }
  const oauthState = await ctx.db.get(args.oauthStateId);
  if (
    oauthState === null ||
    oauthState.provider !== args.expectedProvider ||
    oauthState.organizationId !== args.organizationId ||
    oauthState.userId !== args.userId ||
    oauthState.state !== args.oauthState ||
    oauthState.expectedProviderSnapshotHash !== args.expectedProviderSnapshotHash
  ) {
    throw new Error("OAuth state changed before authorization completed.");
  }
  if (oauthState.expiresAt < Date.now()) {
    throw new Error("OAuth state expired before authorization completed.");
  }
  return oauthState;
}

export const loadForOrganization = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
  },
  returns: vOrganizationProviderConfiguration,
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    return await getOrganizationProviderConfiguration(ctx.db, args.organizationId);
  },
});

/** Return only the provider target needed while a backend OAuth callback is in progress. */
export const loadCloudflareAccountForOAuthCallback = internalQuery({
  args: {
    organizationId: id("organizations"),
  },
  returns: union(vOrganizationCloudflareAccount, vNull()),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    return organization?.cloudflareAccount ?? null;
  },
});

export const loadConvexForOrganizationTeam = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    teamId: string(),
  },
  returns: union(
    object({
      teamId: string(),
      teamSlug: optional(string()),
      credential: optional(vConvexProviderCredential),
    }),
    vNull(),
  ),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    const configuration = await getOrganizationProviderConfiguration(ctx.db, args.organizationId);
    if (configuration.convexTeam?.teamId !== args.teamId) {
      return null;
    }
    return {
      ...configuration.convexTeam,
      ...(configuration.convexCredential ? { credential: configuration.convexCredential } : {}),
    };
  },
});

export async function getProviderCredentialsByConnectedUser(
  db: DatabaseReader,
  args: { connectedByUserId: Id<"users">; limit: number },
): Promise<ConnectedProviderCredential[]> {
  const [convexRows, cloudflareRows] = await Promise.all([
    db
      .query("organizationProviderCredentials")
      .withIndex("by_convex_connected_by_user", (query) =>
        query.eq("convex.connectedByUserId", args.connectedByUserId),
      )
      .take(args.limit),
    db
      .query("organizationProviderCredentials")
      .withIndex("by_cloudflare_connected_by_user", (query) =>
        query.eq("cloudflare.connectedByUserId", args.connectedByUserId),
      )
      .take(args.limit),
  ]);
  const credentials: ConnectedProviderCredential[] = [];
  for (const row of convexRows) {
    if (row.convex !== undefined) {
      credentials.push({
        provider: "convex",
        organizationId: row.organizationId,
        credential: row.convex,
      });
    }
  }
  for (const row of cloudflareRows) {
    if (row.cloudflare !== undefined) {
      credentials.push({
        provider: "cloudflare",
        organizationId: row.organizationId,
        credential: row.cloudflare,
      });
    }
  }
  return credentials
    .sort(
      (left, right) =>
        left.organizationId.localeCompare(right.organizationId) ||
        left.provider.localeCompare(right.provider),
    )
    .slice(0, args.limit);
}

async function resolveOrganizationForCredentialWrite(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    connectedByUserId: Id<"users">;
    oauthState: Doc<"providerOAuthCallbackStates"> | null;
  },
): Promise<Doc<"organizations"> | null> {
  if (args.oauthState === null) {
    await requireActiveOrganizationProviderOwner(ctx.db, {
      organizationId: args.organizationId,
      userId: args.connectedByUserId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    return organization;
  }

  const organization = await findActiveOrganizationProviderOwner(ctx.db, {
    organizationId: args.organizationId,
    userId: args.connectedByUserId,
  });
  if (organization === null) {
    await ctx.db.delete(args.oauthState._id);
  }
  return organization;
}

type ConnectConvexCredentialArgs = {
  organizationId: Id<"organizations">;
  connectedByUserId: Id<"users">;
  expectedProviderSnapshotHash: string;
  auth: Infer<typeof vStandardProviderAuth>;
  teamId: string;
  teamSlug?: string;
  oauthStateId?: Id<"providerOAuthCallbackStates">;
  oauthState?: string;
};

/** Store Convex authorization after one atomic owner, state, and snapshot check. */
export async function connectConvexCredential(
  ctx: Pick<MutationCtx, "db">,
  args: ConnectConvexCredentialArgs,
): Promise<ProviderOAuthStoreResult> {
  const oauthState = await requireOAuthStateForCredentialWrite(ctx, {
    oauthStateId: args.oauthStateId,
    oauthState: args.oauthState,
    expectedProvider: args.auth.method === "oauth" ? "convex" : null,
    organizationId: args.organizationId,
    userId: args.connectedByUserId,
    expectedProviderSnapshotHash: args.expectedProviderSnapshotHash,
  });
  const organization = await resolveOrganizationForCredentialWrite(ctx, {
    organizationId: args.organizationId,
    connectedByUserId: args.connectedByUserId,
    oauthState,
  });
  if (organization === null) {
    return { status: "access_lost" };
  }

  const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
  const snapshotHash = await hashOrganizationProviderSnapshot({
    provider: "convex",
    teamId: organization.convexTeam?.teamId,
    credential: credentials?.convex,
  });
  if (snapshotHash !== args.expectedProviderSnapshotHash) {
    if (oauthState !== null) {
      await ctx.db.delete(oauthState._id);
      return { status: "configuration_changed" };
    }
    throw new Error("Convex configuration changed before authorization completed.");
  }
  if (organization.convexTeam !== undefined && organization.convexTeam.teamId !== args.teamId) {
    if (oauthState !== null) {
      await ctx.db.delete(oauthState._id);
      return { status: "target_mismatch" };
    }
    throw new Error("Convex authorization does not match the configured team.");
  }

  const credential = {
    auth: args.auth,
    connectedByUserId: args.connectedByUserId,
    updatedAt: Date.now(),
  };
  if (credentials === null) {
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId: organization._id,
      convex: credential,
    });
  } else {
    await ctx.db.patch(credentials._id, { convex: credential });
  }
  if (organization.convexTeam === undefined) {
    await ctx.db.patch(organization._id, {
      convexTeam: {
        teamId: args.teamId,
        ...(args.teamSlug ? { teamSlug: args.teamSlug } : {}),
      },
    });
  } else if (args.teamSlug && organization.convexTeam.teamSlug !== args.teamSlug) {
    await ctx.db.patch(organization._id, {
      convexTeam: { ...organization.convexTeam, teamSlug: args.teamSlug },
    });
  }
  if (oauthState !== null) {
    await ctx.db.delete(oauthState._id);
  }
  return { status: "stored" };
}

export const connectConvex = internalMutation({
  args: {
    organizationId: id("organizations"),
    connectedByUserId: id("users"),
    expectedProviderSnapshotHash: string(),
    auth: vStandardProviderAuth,
    teamId: string(),
    teamSlug: optional(string()),
    oauthStateId: optional(id("providerOAuthCallbackStates")),
    oauthState: optional(string()),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await connectConvexCredential(ctx, args);
    return null;
  },
});

type ConnectCloudflareCredentialArgs = {
  organizationId: Id<"organizations">;
  connectedByUserId: Id<"users">;
  expectedProviderSnapshotHash: string;
  auth: Infer<typeof vCloudflareProviderAuth>;
  account: CloudflareAuthorizedAccount;
  tokenHealth?: Infer<typeof vMcpTokenHealth>;
  oauthStateId?: Id<"providerOAuthCallbackStates">;
  oauthState?: string;
};

/** Store Cloudflare authorization after one atomic owner, state, and snapshot check. */
export async function connectCloudflareCredential(
  ctx: Pick<MutationCtx, "db">,
  args: ConnectCloudflareCredentialArgs,
): Promise<ProviderOAuthStoreResult> {
  const oauthState = await requireOAuthStateForCredentialWrite(ctx, {
    oauthStateId: args.oauthStateId,
    oauthState: args.oauthState,
    expectedProvider:
      args.auth.method === "oauth"
        ? "cloudflare"
        : args.auth.method === "mcp_oauth"
          ? "cloudflare_mcp"
          : null,
    organizationId: args.organizationId,
    userId: args.connectedByUserId,
    expectedProviderSnapshotHash: args.expectedProviderSnapshotHash,
  });
  const organization = await resolveOrganizationForCredentialWrite(ctx, {
    organizationId: args.organizationId,
    connectedByUserId: args.connectedByUserId,
    oauthState,
  });
  if (organization === null) {
    return { status: "access_lost" };
  }

  const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
  const snapshotHash = await hashOrganizationProviderSnapshot({
    provider: "cloudflare",
    accountId: organization.cloudflareAccount?.accountId,
    credential: credentials?.cloudflare,
  });
  if (snapshotHash !== args.expectedProviderSnapshotHash) {
    if (oauthState !== null) {
      await ctx.db.delete(oauthState._id);
      return { status: "configuration_changed" };
    }
    throw new Error("Cloudflare configuration changed before authorization completed.");
  }
  if (
    (args.auth.method !== "api_key" && args.account.state === "selection_required") ||
    (organization.cloudflareAccount !== undefined &&
      (args.account.state !== "selected" ||
        args.account.accountId !== organization.cloudflareAccount.accountId))
  ) {
    if (oauthState !== null) {
      await ctx.db.delete(oauthState._id);
      return { status: "target_mismatch" };
    }
    throw new Error("Cloudflare authorization does not match the configured account.");
  }

  const credential = {
    auth: args.auth,
    connectedByUserId: args.connectedByUserId,
    updatedAt: Date.now(),
    ...(args.tokenHealth ? { tokenHealth: args.tokenHealth } : {}),
  };
  if (credentials === null) {
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId: organization._id,
      cloudflare: credential,
    });
  } else {
    await ctx.db.patch(credentials._id, { cloudflare: credential });
  }
  if (organization.cloudflareAccount === undefined && args.account.state === "selected") {
    await ctx.db.patch(organization._id, {
      cloudflareAccount: {
        accountId: args.account.accountId,
        accountName: args.account.accountName,
      },
    });
  } else if (
    organization.cloudflareAccount !== undefined &&
    args.account.state === "selected" &&
    organization.cloudflareAccount.accountName !== args.account.accountName
  ) {
    await ctx.db.patch(organization._id, {
      cloudflareAccount: {
        accountId: organization.cloudflareAccount.accountId,
        accountName: args.account.accountName,
      },
    });
  }
  if (oauthState !== null) {
    await ctx.db.delete(oauthState._id);
  }
  return { status: "stored" };
}

export const connectCloudflare = internalMutation({
  args: {
    organizationId: id("organizations"),
    connectedByUserId: id("users"),
    expectedProviderSnapshotHash: string(),
    auth: vCloudflareProviderAuth,
    account: vCloudflareAuthorizedAccount,
    tokenHealth: optional(vMcpTokenHealth),
    oauthStateId: optional(id("providerOAuthCallbackStates")),
    oauthState: optional(string()),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await connectCloudflareCredential(ctx, args);
    return null;
  },
});

export const selectCloudflareAccount = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    expectedAuth: vCloudflareProviderAuth,
    accountId: string(),
    accountName: string(),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await requireActiveOrganizationProviderOwner(ctx.db, args);
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    if (organization.cloudflareAccount !== undefined) {
      throw new Error("Cloudflare account is already configured.");
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
    if (
      credentials?.cloudflare === undefined ||
      !providerAuthMatches(credentials.cloudflare.auth, args.expectedAuth)
    ) {
      throw new Error("Cloudflare credential changed before account selection completed.");
    }
    await ctx.db.patch(organization._id, {
      cloudflareAccount: { accountId: args.accountId, accountName: args.accountName },
    });
    return null;
  },
});

export const setConvexTeamSlug = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    expectedAuth: vStandardProviderAuth,
    teamId: string(),
    teamSlug: string(),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await requireActiveOrganizationProviderMember(ctx.db, args);
    const organization = await ctx.db.get(args.organizationId);
    if (organization?.convexTeam?.teamId !== args.teamId) {
      throw new Error("Convex team changed before team slug update.");
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
    if (
      credentials?.convex === undefined ||
      !providerAuthMatches(credentials.convex.auth, args.expectedAuth)
    ) {
      throw new Error("Convex credential changed before team slug update.");
    }
    await ctx.db.patch(organization._id, {
      convexTeam: { ...organization.convexTeam, teamSlug: args.teamSlug },
    });
    return null;
  },
});

export const replaceCloudflareCredential = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    expectedAuth: vCloudflareProviderAuth,
    auth: vCloudflareProviderAuth,
    tokenHealth: vMcpTokenHealth,
    expectedTokenRefreshLease: optional(vCloudflareTokenRefreshLease),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    if (args.expectedTokenRefreshLease === undefined) {
      await requireActiveOrganizationProviderMember(ctx.db, args);
    }
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
    if (credentials?.cloudflare === undefined) {
      throw new Error("Cloudflare credential not found.");
    }
    if (!providerAuthMatches(credentials.cloudflare.auth, args.expectedAuth)) {
      throw new Error("Cloudflare credential changed before the update completed.");
    }
    if (
      args.expectedTokenRefreshLease !== undefined &&
      (credentials.cloudflare.tokenRefreshLease?.startedAt !==
        args.expectedTokenRefreshLease.startedAt ||
        credentials.cloudflare.tokenRefreshLease.expiresAt !==
          args.expectedTokenRefreshLease.expiresAt)
    ) {
      throw new Error("Cloudflare token refresh lease changed before the update completed.");
    }
    await ctx.db.patch(credentials._id, {
      cloudflare: {
        ...credentials.cloudflare,
        auth: args.auth,
        tokenHealth: args.tokenHealth,
        updatedAt: providerAuthMatches(credentials.cloudflare.auth, args.auth)
          ? credentials.cloudflare.updatedAt
          : Date.now(),
      },
    });
    return null;
  },
});

export const disconnectConvex = internalMutation({
  args: {
    organizationId: id("organizations"),
    disconnectedByUserId: id("users"),
    expectedAuth: vStandardProviderAuth,
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await requireActiveOrganizationProviderOwner(ctx.db, {
      organizationId: args.organizationId,
      userId: args.disconnectedByUserId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
    if (credentials?.convex === undefined) {
      return null;
    }
    if (!providerAuthMatches(credentials.convex.auth, args.expectedAuth)) {
      throw new Error("Convex credential changed before disconnect completed.");
    }
    if (credentials.cloudflare === undefined) {
      await ctx.db.delete(credentials._id);
    } else {
      await ctx.db.patch(credentials._id, { convex: undefined });
    }
    return null;
  },
});

export const disconnectCloudflare = internalMutation({
  args: {
    organizationId: id("organizations"),
    disconnectedByUserId: id("users"),
    expectedAuth: vCloudflareProviderAuth,
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    await requireActiveOrganizationProviderOwner(ctx.db, {
      organizationId: args.organizationId,
      userId: args.disconnectedByUserId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
    if (credentials?.cloudflare === undefined) {
      return null;
    }
    if (!providerAuthMatches(credentials.cloudflare.auth, args.expectedAuth)) {
      throw new Error("Cloudflare credential changed before disconnect completed.");
    }
    if (credentials.convex === undefined) {
      await ctx.db.delete(credentials._id);
    } else {
      await ctx.db.patch(credentials._id, { cloudflare: undefined });
    }
    return null;
  },
});

export const claimCloudflareTokenRefresh = internalMutation({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    expectedAuth: vCloudflareProviderAuth,
    force: optional(boolean()),
    debounceMs: optional(number()),
  },
  returns: union(
    object({
      claimed: literal(true),
      tokenRefreshLease: vCloudflareTokenRefreshLease,
    }),
    object({
      claimed: literal(false),
      nextAllowedRefreshAt: optional(number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireActiveOrganizationProviderMember(ctx.db, args);
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
    const credential = credentials?.cloudflare;
    if (credentials === null || credential === undefined) {
      return { claimed: false as const };
    }
    if (!providerAuthMatches(credential.auth, args.expectedAuth)) {
      throw new Error("Cloudflare credential changed before token refresh claim.");
    }
    if (credential.auth.method !== "oauth" && credential.auth.method !== "mcp_oauth") {
      return { claimed: false as const };
    }

    const now = Date.now();
    const debounceMs =
      args.debounceMs === undefined
        ? CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS
        : Math.max(0, Math.floor(args.debounceMs));
    if (
      credential.tokenRefreshLease !== undefined &&
      credential.tokenRefreshLease.expiresAt > now
    ) {
      return {
        claimed: false as const,
        nextAllowedRefreshAt: credential.tokenRefreshLease.expiresAt,
      };
    }
    if (
      !args.force &&
      credential.lastTokenRefreshAt !== undefined &&
      now - credential.lastTokenRefreshAt < debounceMs
    ) {
      return {
        claimed: false as const,
        nextAllowedRefreshAt: credential.lastTokenRefreshAt + debounceMs,
      };
    }

    const tokenRefreshLease = {
      startedAt: now,
      expiresAt: now + CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS,
    };
    await ctx.db.patch(credentials._id, {
      cloudflare: { ...credential, tokenRefreshLease },
    });
    return { claimed: true as const, tokenRefreshLease };
  },
});

export const releaseCloudflareTokenRefresh = internalMutation({
  args: {
    organizationId: id("organizations"),
    expectedAuth: vCloudflareProviderAuth,
    expectedTokenRefreshLease: vCloudflareTokenRefreshLease,
    recordLastTokenRefreshAt: optional(boolean()),
  },
  returns: object({
    lastTokenRefreshAt: optional(number()),
  }),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const credentials = await getOrganizationProviderCredentials(ctx.db, organization._id);
    const credential = credentials?.cloudflare;
    if (credentials === null || credential === undefined) {
      return {};
    }
    if (!providerAuthMatches(credential.auth, args.expectedAuth)) {
      throw new Error("Cloudflare credential changed before token refresh release.");
    }
    if (credential.auth.method !== "oauth" && credential.auth.method !== "mcp_oauth") {
      return {};
    }
    if (
      credential.tokenRefreshLease?.startedAt !== args.expectedTokenRefreshLease.startedAt ||
      credential.tokenRefreshLease.expiresAt !== args.expectedTokenRefreshLease.expiresAt
    ) {
      throw new Error("Cloudflare token refresh lease changed before release.");
    }

    const now = Date.now();
    await ctx.db.patch(credentials._id, {
      cloudflare: {
        ...credential,
        tokenRefreshLease: undefined,
        ...(args.recordLastTokenRefreshAt ? { lastTokenRefreshAt: now } : {}),
      },
    });
    return args.recordLastTokenRefreshAt ? { lastTokenRefreshAt: now } : {};
  },
});
