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

const { boolean, id, literal, number, object, string, union } = v;

const GITHUB_USER_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS = 60 * 1000;

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
  if (user === null || user.accountDeletion !== undefined) {
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

export const claimForUse = internalMutation({
  args: {
    userId: id("users"),
    githubUserId: string(),
  },
  returns: vGitHubUserAuthorizationUse,
  handler: async (ctx, args) => {
    await requireMatchingGitHubSignIn(ctx.db, args);
    const authorization = await getByUser(ctx.db, args.userId);
    if (authorization === null || authorization.githubUserId !== args.githubUserId) {
      throw new Error("GitHub user authorization is not available for this owner.");
    }

    const now = Date.now();
    if (authorization.accessTokenExpiresAt > now + GITHUB_USER_TOKEN_REFRESH_BUFFER_MS) {
      return {
        kind: "ready" as const,
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
      return { kind: "busy" as const };
    }

    await ctx.db.patch(authorization._id, { refreshStartedAt: now });
    return {
      kind: "claimed" as const,
      authorization: toAuthorizationForUse(authorization),
      refreshStartedAt: now,
    };
  },
});

export const finishRefresh = internalMutation({
  args: {
    authorizationId: id("githubUserAuthorizations"),
    refreshStartedAt: number(),
    accessToken: string(),
    accessTokenExpiresAt: number(),
    refreshToken: string(),
    refreshTokenExpiresAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authorization = await ctx.db.get(args.authorizationId);
    if (authorization === null || authorization.refreshStartedAt !== args.refreshStartedAt) {
      throw new Error("GitHub user authorization refresh lock changed.");
    }

    await ctx.db.patch(authorization._id, {
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshToken: args.refreshToken,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      refreshStartedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const releaseRefresh = internalMutation({
  args: {
    authorizationId: id("githubUserAuthorizations"),
    refreshStartedAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authorization = await ctx.db.get(args.authorizationId);
    if (authorization?.refreshStartedAt === args.refreshStartedAt) {
      await ctx.db.patch(authorization._id, { refreshStartedAt: undefined });
    }
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

export const revokeAndDeleteByUser = internalAction({
  args: {
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const authorization: GitHubUserAuthorizationForRevocation | null = await ctx.runQuery(
      internal.githubUserAuthorizations.getForRevocation,
      args,
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

export async function resolveGitHubUserOctokit(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: Id<"users">;
    githubUserId: string;
  },
): Promise<Octokit> {
  const use: Infer<typeof vGitHubUserAuthorizationUse> = await ctx.runMutation(
    internal.githubUserAuthorizations.claimForUse,
    args,
  );
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
    await ctx.runMutation(internal.githubUserAuthorizations.finishRefresh, {
      authorizationId: use.authorization.authorizationId,
      refreshStartedAt: use.refreshStartedAt,
      ...refreshed,
    });
    return createGitHubUserOctokit(refreshed.accessToken);
  } catch (error) {
    await ctx.runMutation(internal.githubUserAuthorizations.releaseRefresh, {
      authorizationId: use.authorization.authorizationId,
      refreshStartedAt: use.refreshStartedAt,
    });
    throw error;
  }
}
