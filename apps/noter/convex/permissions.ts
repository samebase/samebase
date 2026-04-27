import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, query, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getConnectionByUserAndKind } from "./providerConnections";
import {
  emptyUserAccess,
  hasAppAccess,
  hasPermission,
  isAdminUser,
  resolveUserPermissions,
  userAccessByUserIdArgsValidator,
  userAccessValidator,
  userPermissionValidator,
  type UserAccess,
} from "./permissionsModel";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { UserPermission } from "../shared/userPermissions";

type PermissionReadCtx = QueryCtx | MutationCtx;

async function readGithubUsername(
  ctx: PermissionReadCtx,
  userId: Id<"users">,
): Promise<string | undefined> {
  const githubConnection = await getConnectionByUserAndKind(
    ctx.db,
    userId,
    "github",
  );
  return githubConnection?.kind === "github"
    ? githubConnection.username
    : undefined;
}

export async function readUserAccess(
  ctx: PermissionReadCtx,
  userId: Id<"users">,
): Promise<UserAccess> {
  const user = await ctx.db.get(userId);
  if (!user) {
    return emptyUserAccess();
  }

  const githubUsername = await readGithubUsername(ctx, userId);
  const isAdmin = isAdminUser(githubUsername, user.email);

  return {
    isAuthenticated: true,
    isApproved: hasAppAccess({
      githubUsername,
      email: user.email,
      isApproved: user.isApproved,
    }),
    isAdmin,
    permissions: resolveUserPermissions({
      githubUsername,
      email: user.email,
      isApproved: user.isApproved,
      permissionGrants: user.permissionGrants,
    }),
  };
}

export async function readCurrentUserAccess(
  ctx: PermissionReadCtx,
): Promise<UserAccess> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return emptyUserAccess();
  }
  return await readUserAccess(ctx, userId);
}

export async function hasCurrentUserPermission(
  ctx: PermissionReadCtx,
  permission: UserPermission,
): Promise<boolean> {
  const access = await readCurrentUserAccess(ctx);
  return hasPermission(access, permission);
}

export async function hasCurrentUserAnyPermission(
  ctx: PermissionReadCtx,
  permissions: readonly UserPermission[],
): Promise<boolean> {
  const access = await readCurrentUserAccess(ctx);
  return permissions.some((permission) => hasPermission(access, permission));
}

export async function requireCurrentUserPermission(
  ctx: PermissionReadCtx,
  permission: UserPermission,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("User not authenticated");
  }

  const access = await readUserAccess(ctx, userId);
  if (!hasPermission(access, permission)) {
    throw new Error("Unauthorized");
  }

  return userId;
}

export async function requireCurrentUserPermissionForAction(
  ctx: Pick<ActionCtx, "auth" | "runQuery">,
  permission: UserPermission,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("User not authenticated");
  }

  const access = await ctx.runQuery(
    internal.permissions.getUserAccessByUserId,
    {
      userId,
    },
  );
  if (!hasPermission(access, permission)) {
    throw new Error("Unauthorized");
  }

  return userId;
}

export async function requireCurrentUserAnyPermissionForAction(
  ctx: Pick<ActionCtx, "auth" | "runQuery">,
  permissions: readonly UserPermission[],
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("User not authenticated");
  }

  const access = await ctx.runQuery(
    internal.permissions.getUserAccessByUserId,
    {
      userId,
    },
  );
  if (!permissions.some((permission) => hasPermission(access, permission))) {
    throw new Error("Unauthorized");
  }

  return userId;
}

export const currentUserAccess = query({
  args: {},
  returns: userAccessValidator,
  handler: async (ctx): Promise<UserAccess> => {
    return await readCurrentUserAccess(ctx);
  },
});

export const getUserAccessByUserId = internalQuery({
  args: userAccessByUserIdArgsValidator,
  returns: userAccessValidator,
  handler: async (ctx, args): Promise<UserAccess> => {
    return await readUserAccess(ctx, args.userId);
  },
});

export const hasCurrentPermission = query({
  args: {
    permission: userPermissionValidator,
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    return await hasCurrentUserPermission(ctx, args.permission);
  },
});
