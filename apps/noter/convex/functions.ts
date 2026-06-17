import { getAuthUserId } from "@convex-dev/auth/server";
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action as baseAction,
  internalQuery,
  mutation as baseMutation,
  query as baseQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getConnectionByUserAndKind } from "./providerConnections";
import { hasAppAccess, isAdminUser } from "./userAccess";
import { canAccess, type AccessKey, type ViewerRole } from "../shared/accessModel";

const { id, literal, null: vNull, object, union } = v;

type AppQueryPolicy = {
  access: AccessKey;
};

type AppWritePolicy = {
  access: AccessKey;
};

type ResolvedViewer = {
  role: ViewerRole;
  userId: Id<"users"> | null;
};

export type AppViewer = ResolvedViewer & {
  requiredAccess: AccessKey;
};

const vViewerRole = union(literal("role_anonymous"), literal("role_member"), literal("role_staff"));

const vResolvedViewer = object({
  role: vViewerRole,
  userId: union(id("users"), vNull()),
});

async function resolveViewerFromDb(ctx: QueryCtx | MutationCtx): Promise<ResolvedViewer> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return { role: "role_anonymous", userId };
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    return { role: "role_anonymous", userId };
  }

  const githubConnection = await getConnectionByUserAndKind(ctx.db, userId, "github");
  const githubUsername =
    githubConnection?.kind === "github" ? githubConnection.username : undefined;

  if (isAdminUser(githubUsername, user.email)) {
    return { role: "role_staff", userId };
  }

  if (
    hasAppAccess({
      githubUsername,
      email: user.email,
      isApproved: user.isApproved,
    })
  ) {
    return { role: "role_member", userId };
  }

  return { role: "role_anonymous", userId };
}

function assertViewerAccess(requiredAccess: AccessKey, viewer: ResolvedViewer): AppViewer {
  if (!canAccess(requiredAccess, viewer.role)) {
    throw new Error("Access denied");
  }
  return { ...viewer, requiredAccess };
}

async function applyQueryPolicy(ctx: QueryCtx, policy: AppQueryPolicy) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertViewerAccess(policy.access, viewer);

  return { viewer: appViewer };
}

async function applyMutationPolicy(ctx: MutationCtx, policy: AppWritePolicy) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertViewerAccess(policy.access, viewer);

  return { viewer: appViewer };
}

export const resolveViewerForAction = internalQuery({
  args: {},
  returns: vResolvedViewer,
  handler: async (ctx): Promise<ResolvedViewer> => {
    return await resolveViewerFromDb(ctx);
  },
});

export const query = customQuery(
  baseQuery,
  customCtx(async (ctx, policy: AppQueryPolicy) => {
    return await applyQueryPolicy(ctx, policy);
  }),
);

export const mutation = customMutation(
  baseMutation,
  customCtx(async (ctx, policy: AppWritePolicy) => {
    return await applyMutationPolicy(ctx, policy);
  }),
);

export const action = customAction(
  baseAction,
  customCtx(async (ctx, policy: AppWritePolicy) => {
    const viewer: ResolvedViewer = await ctx.runQuery(
      internal.functions.resolveViewerForAction,
      {},
    );
    const appViewer = assertViewerAccess(policy.access, viewer);

    return { viewer: appViewer };
  }),
);
