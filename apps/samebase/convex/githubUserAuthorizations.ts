import { createOAuthUserAuth } from "@octokit/auth-app";
import type { Octokit } from "@octokit/rest";
import { ConvexError, Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";
import { action, query } from "./functions";
import {
  createGitHubUserOctokit,
  getGitHubAppConfiguration,
  requireExpiringGitHubUserAuthentication,
} from "./githubApp";
import { requireOrganizationAccessContext } from "./organizationAccess";
import { readActiveUser } from "./userLifecycle";
import { requireActiveVaultProvisioningAuthority } from "./vaultWorkflowAuthority";

const { boolean, id, literal, number, object, string, union } = v;

const GITHUB_USER_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
export const GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS = 60 * 1000;

const vViewerPersonalRepositoryAuthorizationStatus = union(
  object({ status: literal("sign_in_required"), authorizationPresent: boolean() }),
  object({ status: literal("sign_in_mismatch"), authorizationPresent: boolean() }),
  object({ status: literal("not_connected") }),
  object({
    status: literal("authorized"),
    githubUserLogin: string(),
    refreshTokenExpiresAt: number(),
  }),
  object({
    status: literal("different_account"),
    githubUserLogin: string(),
  }),
);
type ViewerPersonalRepositoryAuthorizationStatus = Infer<
  typeof vViewerPersonalRepositoryAuthorizationStatus
>;

const vGitHubUserAuthorizationForUse = object({
  authorizationId: id("githubUserAuthorizations"),
  userId: id("users"),
  githubUserId: string(),
  githubUserLogin: string(),
  accessToken: string(),
  accessTokenExpiresAt: number(),
  refreshToken: string(),
  refreshTokenExpiresAt: number(),
});

type GitHubUserAuthorizationForUse = Infer<typeof vGitHubUserAuthorizationForUse>;

const vGitHubUserAuthorizationUse = union(
  object({
    kind: literal("ready"),
    authorization: vGitHubUserAuthorizationForUse,
  }),
  object({
    kind: literal("claimed"),
    authorization: vGitHubUserAuthorizationForUse,
    refreshStartedAt: number(),
  }),
  object({
    kind: literal("busy"),
  }),
);

const vGitHubUserAuthorizationForRevocationValue = object({
  authorizationId: id("githubUserAuthorizations"),
  githubUserId: string(),
  accessToken: string(),
});
const vGitHubUserAuthorizationForRevocation = union(
  vGitHubUserAuthorizationForRevocationValue,
  v.null(),
);
type GitHubUserAuthorizationForRevocation = Infer<
  typeof vGitHubUserAuthorizationForRevocationValue
>;

function toAuthorizationForUse(
  authorization: Doc<"githubUserAuthorizations">,
): GitHubUserAuthorizationForUse {
  return {
    authorizationId: authorization._id,
    userId: authorization.userId,
    githubUserId: authorization.githubUserId,
    githubUserLogin: authorization.githubUserLogin,
    accessToken: authorization.accessToken,
    accessTokenExpiresAt: authorization.accessTokenExpiresAt,
    refreshToken: authorization.refreshToken,
    refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
  };
}

async function getByUser(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<Doc<"githubUserAuthorizations"> | null> {
  return await db
    .query("githubUserAuthorizations")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
}

export async function readGitHubSignInProviderAccountId(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<string | null> {
  const accounts = await db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (query) => query.eq("userId", userId).eq("provider", "github"))
    .take(2);
  if (accounts.length > 1) {
    throw new Error("This Samebase account has conflicting GitHub sign-in identities.");
  }
  const account = accounts.at(0);
  if (account === undefined) {
    return null;
  }
  return account.providerAccountId;
}

export async function readGitHubSignInMatch(
  db: DatabaseReader,
  args: {
    userId: Id<"users">;
    githubUserId: string;
  },
): Promise<"matched" | "missing" | "different"> {
  const providerAccountId = await readGitHubSignInProviderAccountId(db, args.userId);
  if (providerAccountId === null) {
    return "missing";
  }
  return providerAccountId === args.githubUserId ? "matched" : "different";
}

export async function requireMatchingGitHubSignIn(
  db: DatabaseReader,
  args: {
    userId: Id<"users">;
    githubUserId: string;
  },
): Promise<void> {
  const match = await readGitHubSignInMatch(db, args);
  if (match === "missing") {
    throw new ConvexError("github-sign-in-required");
  }
  if (match === "different") {
    throw new ConvexError("github-sign-in-mismatch");
  }
}

async function requirePersonalGitHubOwner(
  db: DatabaseReader,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  },
): Promise<Doc<"organizations">> {
  await requireOrganizationAccessContext(db, args);
  const organization = await db.get(args.organizationId);
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  if (organization.githubOwnerType !== "user") {
    throw new Error("Personal repository authorization requires a personal GitHub owner.");
  }
  return organization;
}

export const getViewerPersonalRepositoryAuthorization = query({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vViewerPersonalRepositoryAuthorizationStatus,
  handler: async (ctx, args): Promise<ViewerPersonalRepositoryAuthorizationStatus> => {
    const organization = await requirePersonalGitHubOwner(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    const authorization = await getByUser(ctx.db, ctx.viewer.userId);
    if (authorization !== null && authorization.githubUserId !== organization.githubOwnerId) {
      return {
        status: "different_account",
        githubUserLogin: authorization.githubUserLogin,
      };
    }
    const signInMatch = await readGitHubSignInMatch(ctx.db, {
      userId: ctx.viewer.userId,
      githubUserId: organization.githubOwnerId,
    });
    if (signInMatch === "missing") {
      return { status: "sign_in_required", authorizationPresent: authorization !== null };
    }
    if (signInMatch === "different") {
      return { status: "sign_in_mismatch", authorizationPresent: authorization !== null };
    }
    if (authorization === null) {
      return { status: "not_connected" };
    }

    return {
      status: "authorized",
      githubUserLogin: authorization.githubUserLogin,
      refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
    };
  },
});

export async function upsertGitHubUserAuthorization(
  db: DatabaseWriter,
  args: {
    userId: Id<"users">;
    githubUserId: string;
    githubUserLogin: string;
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
  },
): Promise<void> {
  const user = await db.get(args.userId);
  if (user === null || readActiveUser(user) === null) {
    throw new Error("An active Samebase user is required.");
  }

  await requireMatchingGitHubSignIn(db, {
    userId: args.userId,
    githubUserId: args.githubUserId,
  });

  const [githubSignInOwners, githubOwners] = await Promise.all([
    db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (query) =>
        query.eq("provider", "github").eq("providerAccountId", args.githubUserId),
      )
      .take(2),
    db
      .query("githubUserAuthorizations")
      .withIndex("by_github_user", (query) => query.eq("githubUserId", args.githubUserId))
      .take(2),
  ]);
  if (githubSignInOwners.length > 1) {
    throw new Error("This GitHub account has conflicting Samebase sign-in records.");
  }
  if (githubSignInOwners.some((account) => account.userId !== args.userId)) {
    throw new Error("This GitHub account is a sign-in method for another Samebase account.");
  }
  if (githubOwners.some((authorization) => authorization.userId !== args.userId)) {
    throw new Error("This GitHub account already provides access for another Samebase account.");
  }
  if (githubOwners.length > 1) {
    throw new Error("This GitHub account has conflicting Samebase access records.");
  }

  const now = Date.now();
  const existing = await getByUser(db, args.userId);
  if (existing !== null && existing.githubUserId !== args.githubUserId) {
    throw new Error("A different GitHub account already provides access for this account.");
  }
  const authorization = {
    githubUserId: args.githubUserId,
    githubUserLogin: args.githubUserLogin,
    accessToken: args.accessToken,
    accessTokenExpiresAt: args.accessTokenExpiresAt,
    refreshToken: args.refreshToken,
    refreshTokenExpiresAt: args.refreshTokenExpiresAt,
    refreshStartedAt: undefined,
    updatedAt: now,
  };
  if (existing !== null) {
    await db.patch(existing._id, authorization);
    return;
  }

  await db.insert("githubUserAuthorizations", {
    userId: args.userId,
    ...authorization,
    createdAt: now,
  });
}

async function claimForUseAfterAuthority(
  db: DatabaseWriter,
  args: { userId: Id<"users">; githubUserId: string },
): Promise<Infer<typeof vGitHubUserAuthorizationUse>> {
  await requireMatchingGitHubSignIn(db, args);
  const authorization = await getByUser(db, args.userId);
  if (authorization === null || authorization.githubUserId !== args.githubUserId) {
    throw new Error("GitHub user authorization is not available for this owner.");
  }

  const now = Date.now();
  if (authorization.accessTokenExpiresAt > now + GITHUB_USER_TOKEN_REFRESH_BUFFER_MS) {
    return {
      kind: "ready",
      authorization: toAuthorizationForUse(authorization),
    };
  }
  if (authorization.refreshTokenExpiresAt <= now) {
    throw new Error("GitHub user authorization has expired.");
  }
  if (
    authorization.refreshStartedAt !== undefined &&
    now - authorization.refreshStartedAt < GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS
  ) {
    return { kind: "busy" };
  }

  await db.patch(authorization._id, { refreshStartedAt: now });
  return {
    kind: "claimed",
    authorization: toAuthorizationForUse(authorization),
    refreshStartedAt: now,
  };
}

export const claimForUse = internalMutation({
  args: {
    userId: id("users"),
    githubUserId: string(),
  },
  returns: vGitHubUserAuthorizationUse,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null || readActiveUser(user) === null) {
      throw new Error("An active Samebase user is required.");
    }
    return await claimForUseAfterAuthority(ctx.db, args);
  },
});

export const claimForProvisioningRun = internalMutation({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    vaultId: id("vaults"),
    githubUserId: string(),
  },
  returns: vGitHubUserAuthorizationUse,
  handler: async (ctx, args) => {
    await requireActiveVaultProvisioningAuthority(ctx.db, args);
    return await claimForUseAfterAuthority(ctx.db, args);
  },
});

async function finishRefreshAfterAuthority(
  db: DatabaseWriter,
  expectedUserId: Id<"users">,
  args: {
    authorizationId: Id<"githubUserAuthorizations">;
    refreshStartedAt: number;
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
  },
): Promise<void> {
  const authorization = await db.get(args.authorizationId);
  if (
    authorization === null ||
    authorization.userId !== expectedUserId ||
    authorization.refreshStartedAt !== args.refreshStartedAt
  ) {
    throw new Error("GitHub user authorization refresh lock changed.");
  }
  await db.patch(authorization._id, {
    accessToken: args.accessToken,
    accessTokenExpiresAt: args.accessTokenExpiresAt,
    refreshToken: args.refreshToken,
    refreshTokenExpiresAt: args.refreshTokenExpiresAt,
    refreshStartedAt: undefined,
    updatedAt: Date.now(),
  });
}

const finishRefreshArgs = {
  authorizationId: id("githubUserAuthorizations"),
  refreshStartedAt: number(),
  accessToken: string(),
  accessTokenExpiresAt: number(),
  refreshToken: string(),
  refreshTokenExpiresAt: number(),
} as const;

export const finishRefresh = internalMutation({
  args: finishRefreshArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const authorization = await ctx.db.get(args.authorizationId);
    if (authorization === null || authorization.refreshStartedAt !== args.refreshStartedAt) {
      throw new Error("GitHub user authorization refresh lock changed.");
    }
    await finishRefreshAfterAuthority(ctx.db, authorization.userId, args);
    return null;
  },
});

export const finishRefreshForProvisioningRun = internalMutation({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    vaultId: id("vaults"),
    ...finishRefreshArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireActiveVaultProvisioningAuthority(ctx.db, args);
    await finishRefreshAfterAuthority(ctx.db, args.userId, args);
    return null;
  },
});

async function releaseRefreshAfterAuthority(
  db: DatabaseWriter,
  expectedUserId: Id<"users">,
  args: {
    authorizationId: Id<"githubUserAuthorizations">;
    refreshStartedAt: number;
  },
): Promise<void> {
  const authorization = await db.get(args.authorizationId);
  if (authorization?.refreshStartedAt === args.refreshStartedAt) {
    if (authorization.userId !== expectedUserId) {
      throw new Error("GitHub user authorization refresh lock changed.");
    }
    await db.patch(authorization._id, { refreshStartedAt: undefined });
  }
}

const releaseRefreshArgs = {
  authorizationId: id("githubUserAuthorizations"),
  refreshStartedAt: number(),
} as const;

export const releaseRefresh = internalMutation({
  args: releaseRefreshArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const authorization = await ctx.db.get(args.authorizationId);
    if (authorization?.refreshStartedAt === args.refreshStartedAt) {
      await releaseRefreshAfterAuthority(ctx.db, authorization.userId, args);
    }
    return null;
  },
});

export const releaseRefreshForProvisioningRun = internalMutation({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    vaultId: id("vaults"),
    ...releaseRefreshArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireActiveVaultProvisioningAuthority(ctx.db, args);
    await releaseRefreshAfterAuthority(ctx.db, args.userId, args);
    return null;
  },
});

export const getForRevocation = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: vGitHubUserAuthorizationForRevocation,
  handler: async (ctx, args) => {
    const authorization = await getByUser(ctx.db, args.userId);
    if (authorization === null) {
      return null;
    }

    return {
      authorizationId: authorization._id,
      githubUserId: authorization.githubUserId,
      accessToken: authorization.accessToken,
    };
  },
});

export const getForPersonalRepositoryRevocation = internalQuery({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
  },
  returns: vGitHubUserAuthorizationForRevocation,
  handler: async (ctx, args) => {
    await requirePersonalGitHubOwner(ctx.db, args);
    const authorization = await getByUser(ctx.db, args.userId);
    if (authorization === null) {
      return null;
    }

    return {
      authorizationId: authorization._id,
      githubUserId: authorization.githubUserId,
      accessToken: authorization.accessToken,
    };
  },
});

export const deleteRevoked = internalMutation({
  args: {
    authorizationId: id("githubUserAuthorizations"),
    githubUserId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authorization = await ctx.db.get(args.authorizationId);
    if (authorization?.githubUserId === args.githubUserId) {
      await ctx.db.delete(authorization._id);
    }
    return null;
  },
});

async function revokeGitHubUserAuthorization(
  ctx: Pick<ActionCtx, "runMutation">,
  authorization: GitHubUserAuthorizationForRevocation,
): Promise<null> {
  const configuration = getGitHubAppConfiguration();
  const auth = createOAuthUserAuth({
    clientType: "github-app",
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    token: authorization.accessToken,
  });
  try {
    await auth({ type: "deleteAuthorization" });
  } catch {
    throw new Error("Failed to revoke GitHub user authorization.");
  }

  await ctx.runMutation(internal.githubUserAuthorizations.deleteRevoked, {
    authorizationId: authorization.authorizationId,
    githubUserId: authorization.githubUserId,
  });
  return null;
}

export const revokeForAccountDeletion = internalAction({
  args: {
    runId: id("workflow_accountDeletion_runs"),
    workflowId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const identity = await ctx.runQuery(internal.accountDeletion.stepContext.getOwnedIdentity, {
      runId: args.runId,
      workflowId: args.workflowId,
    });
    const authorization: GitHubUserAuthorizationForRevocation | null = await ctx.runQuery(
      internal.githubUserAuthorizations.getForRevocation,
      { userId: identity.userId },
    );
    return authorization === null ? null : await revokeGitHubUserAuthorization(ctx, authorization);
  },
});

export const revokeViewerPersonalRepositoryAuthorization = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const authorization: GitHubUserAuthorizationForRevocation | null = await ctx.runQuery(
      internal.githubUserAuthorizations.getForPersonalRepositoryRevocation,
      {
        organizationId: args.organizationId,
        userId: ctx.viewer.userId,
      },
    );
    return authorization === null ? null : await revokeGitHubUserAuthorization(ctx, authorization);
  },
});

type GitHubUserOctokitAuthority =
  | { kind: "user"; userId: Id<"users"> }
  | {
      kind: "provisioning";
      runId: Id<"workflow_vaultProvisioning_runs">;
      userId: Id<"users">;
      vaultId: Id<"vaults">;
    };

async function claimGitHubUserAuthorization(
  ctx: Pick<ActionCtx, "runMutation">,
  authority: GitHubUserOctokitAuthority,
  githubUserId: string,
): Promise<Infer<typeof vGitHubUserAuthorizationUse>> {
  switch (authority.kind) {
    case "user":
      return await ctx.runMutation(internal.githubUserAuthorizations.claimForUse, {
        userId: authority.userId,
        githubUserId,
      });
    case "provisioning":
      return await ctx.runMutation(internal.githubUserAuthorizations.claimForProvisioningRun, {
        runId: authority.runId,
        userId: authority.userId,
        vaultId: authority.vaultId,
        githubUserId,
      });
    default:
      authority satisfies never;
      throw new Error("GitHub user authorization authority is invalid.");
  }
}

async function finishGitHubUserAuthorizationRefresh(
  ctx: Pick<ActionCtx, "runMutation">,
  authority: GitHubUserOctokitAuthority,
  args: {
    authorizationId: Id<"githubUserAuthorizations">;
    refreshStartedAt: number;
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
  },
): Promise<void> {
  switch (authority.kind) {
    case "user":
      await ctx.runMutation(internal.githubUserAuthorizations.finishRefresh, {
        authorizationId: args.authorizationId,
        refreshStartedAt: args.refreshStartedAt,
        accessToken: args.accessToken,
        accessTokenExpiresAt: args.accessTokenExpiresAt,
        refreshToken: args.refreshToken,
        refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      });
      return;
    case "provisioning":
      await ctx.runMutation(internal.githubUserAuthorizations.finishRefreshForProvisioningRun, {
        runId: authority.runId,
        userId: authority.userId,
        vaultId: authority.vaultId,
        authorizationId: args.authorizationId,
        refreshStartedAt: args.refreshStartedAt,
        accessToken: args.accessToken,
        accessTokenExpiresAt: args.accessTokenExpiresAt,
        refreshToken: args.refreshToken,
        refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      });
      return;
    default:
      authority satisfies never;
      throw new Error("GitHub user authorization authority is invalid.");
  }
}

async function releaseGitHubUserAuthorizationRefresh(
  ctx: Pick<ActionCtx, "runMutation">,
  authority: GitHubUserOctokitAuthority,
  args: {
    authorizationId: Id<"githubUserAuthorizations">;
    refreshStartedAt: number;
  },
): Promise<void> {
  switch (authority.kind) {
    case "user":
      await ctx.runMutation(internal.githubUserAuthorizations.releaseRefresh, {
        authorizationId: args.authorizationId,
        refreshStartedAt: args.refreshStartedAt,
      });
      return;
    case "provisioning":
      await ctx.runMutation(internal.githubUserAuthorizations.releaseRefreshForProvisioningRun, {
        runId: authority.runId,
        userId: authority.userId,
        vaultId: authority.vaultId,
        authorizationId: args.authorizationId,
        refreshStartedAt: args.refreshStartedAt,
      });
      return;
    default:
      authority satisfies never;
      throw new Error("GitHub user authorization authority is invalid.");
  }
}

async function resolveGitHubUserOctokitForAuthority(
  ctx: Pick<ActionCtx, "runMutation">,
  authority: GitHubUserOctokitAuthority,
  githubUserId: string,
): Promise<Octokit> {
  const use = await claimGitHubUserAuthorization(ctx, authority, githubUserId);
  if (use.kind === "ready") {
    return createGitHubUserOctokit(use.authorization.accessToken);
  }
  if (use.kind === "busy") {
    throw new Error("GitHub user authorization refresh is in progress.");
  }

  const configuration = getGitHubAppConfiguration();
  try {
    const auth = createOAuthUserAuth({
      clientType: "github-app",
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      token: use.authorization.accessToken,
      expiresAt: new Date(use.authorization.accessTokenExpiresAt).toISOString(),
      refreshToken: use.authorization.refreshToken,
      refreshTokenExpiresAt: new Date(use.authorization.refreshTokenExpiresAt).toISOString(),
    });
    const refreshed = requireExpiringGitHubUserAuthentication(await auth({ type: "refresh" }));
    await finishGitHubUserAuthorizationRefresh(ctx, authority, {
      authorizationId: use.authorization.authorizationId,
      refreshStartedAt: use.refreshStartedAt,
      ...refreshed,
    });
    return createGitHubUserOctokit(refreshed.accessToken);
  } catch (error) {
    await releaseGitHubUserAuthorizationRefresh(ctx, authority, {
      authorizationId: use.authorization.authorizationId,
      refreshStartedAt: use.refreshStartedAt,
    });
    throw error;
  }
}

export async function resolveGitHubUserOctokit(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: Id<"users">;
    githubUserId: string;
  },
): Promise<Octokit> {
  return await resolveGitHubUserOctokitForAuthority(
    ctx,
    { kind: "user", userId: args.userId },
    args.githubUserId,
  );
}

export async function resolveGitHubUserOctokitForProvisioningRun(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    githubUserId: string;
  },
): Promise<Octokit> {
  return await resolveGitHubUserOctokitForAuthority(
    ctx,
    {
      kind: "provisioning",
      runId: args.runId,
      userId: args.userId,
      vaultId: args.vaultId,
    },
    args.githubUserId,
  );
}
