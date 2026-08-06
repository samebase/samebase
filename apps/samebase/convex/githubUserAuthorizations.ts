import { createOAuthUserAuth } from "@octokit/auth-app";
import type { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";

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

const { id, literal, number, object, string, union } = v;

const GITHUB_USER_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS = 60 * 1000;

const vViewerGitHubUserAuthorizationStatus = union(
  object({ status: literal("not_connected") }),
  object({
    status: literal("authorized"),
    githubUserLogin: string(),
    refreshTokenExpiresAt: number(),
  }),
);
type ViewerGitHubUserAuthorizationStatus = Infer<typeof vViewerGitHubUserAuthorizationStatus>;

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

const vGitHubUserAuthorizationForRevocation = union(
  object({
    authorizationId: id("githubUserAuthorizations"),
    githubUserId: string(),
    accessToken: string(),
  }),
  v.null(),
);

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

export const getViewerStatus = query({
  access: "access_user_preferences",
  args: {},
  returns: vViewerGitHubUserAuthorizationStatus,
  handler: async (ctx): Promise<ViewerGitHubUserAuthorizationStatus> => {
    const authorization = await getByUser(ctx.db, ctx.viewer.userId);
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

  const now = Date.now();
  const existing = await getByUser(db, args.userId);
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

export const revokeAndDeleteByUser = internalAction({
  args: {
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authorization = await ctx.runQuery(
      internal.githubUserAuthorizations.getForRevocation,
      args,
    );
    if (authorization === null) {
      return null;
    }

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
  },
});

export const revokeViewerAuthorization = action({
  access: "access_user_preferences",
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const result: null = await ctx.runAction(
      internal.githubUserAuthorizations.revokeAndDeleteByUser,
      {
        userId: ctx.viewer.userId,
      },
    );
    return result;
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
