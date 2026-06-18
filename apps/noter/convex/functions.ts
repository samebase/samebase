/* oxlint-disable noter/no-raw-public-convex-function-builders -- adapter boundary that wraps generated public builders with access policy */
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action as baseAction,
  internalQuery,
  mutation as baseMutation,
  query as baseQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getConnectionByUserAndKind } from "./providerConnections";
import schema from "./schema";
import { hasAppAccess, isAdminUser } from "./userAccess";
import {
  canAccess,
  type AuthenticatedAccessKey,
  type PublicAccessKey,
  type ViewerRole,
} from "../shared/accessModel";
import type {
  AppAuthenticatedPolicy,
  AppFunctionBuilder,
  AppFunctionPolicy,
} from "../shared/convexFunctionPolicyTypes";

const { id, literal, null: vNull, number, object, union } = v;

// Viewer model exposed through ctx.viewer on app-owned Convex builders.
type AnonymousViewerRole = "role_anonymous";
type AuthenticatedViewerRole = Exclude<ViewerRole, AnonymousViewerRole>;

type AnonymousResolvedViewer = {
  role: AnonymousViewerRole;
  userId: Id<"users"> | null;
  user: Doc<"users"> | null;
};

type AuthenticatedResolvedViewer = {
  role: AuthenticatedViewerRole;
  userId: Id<"users">;
  user: Doc<"users">;
};

type ResolvedViewer = AnonymousResolvedViewer | AuthenticatedResolvedViewer;

export type PublicAppViewer = ResolvedViewer & {
  requiredAccess: PublicAccessKey;
};

export type AuthenticatedAppViewer = AuthenticatedResolvedViewer & {
  requiredAccess: AuthenticatedAccessKey;
};

export type AppViewer = PublicAppViewer | AuthenticatedAppViewer;

// Validator mirror for the action runtime hop through resolveViewerForAction.
const vAuthenticatedViewerRole = union(literal("role_member"), literal("role_staff"));
const vUserDoc = schema.tables.users.validator.extend({
  _id: id("users"),
  _creationTime: number(),
});

const vAnonymousResolvedViewer = object({
  role: literal("role_anonymous"),
  userId: union(id("users"), vNull()),
  user: union(vUserDoc, vNull()),
});

const vAuthenticatedResolvedViewer = object({
  role: vAuthenticatedViewerRole,
  userId: id("users"),
  user: vUserDoc,
});

const vResolvedViewer = union(vAnonymousResolvedViewer, vAuthenticatedResolvedViewer);

// Runtime policy: resolve the current viewer and enforce access keys.
async function resolveViewerFromDb(ctx: QueryCtx | MutationCtx): Promise<ResolvedViewer> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return { role: "role_anonymous", userId, user: null };
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    return { role: "role_anonymous", userId, user: null };
  }

  const githubConnection = await getConnectionByUserAndKind(ctx.db, userId, "github");
  const githubUsername =
    githubConnection?.kind === "github" ? githubConnection.username : undefined;

  if (isAdminUser(githubUsername, user.email)) {
    return { role: "role_staff", userId, user };
  }

  if (
    hasAppAccess({
      githubUsername,
      email: user.email,
      isApproved: user.isApproved,
    })
  ) {
    return { role: "role_member", userId, user };
  }

  return { role: "role_anonymous", userId, user };
}

function assertPublicViewerAccess(viewer: ResolvedViewer): PublicAppViewer {
  if (!canAccess("access_public", viewer.role)) {
    throw new Error("Access denied");
  }
  return { ...viewer, requiredAccess: "access_public" };
}

function assertAuthenticatedViewerAccess(
  requiredAccess: AuthenticatedAccessKey,
  viewer: ResolvedViewer,
): AuthenticatedAppViewer {
  if (viewer.role === "role_anonymous" || !canAccess(requiredAccess, viewer.role)) {
    throw new Error("Access denied");
  }
  return { ...viewer, requiredAccess };
}

async function applyPublicQueryPolicy(ctx: QueryCtx) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertPublicViewerAccess(viewer);

  return { viewer: appViewer };
}

async function applyAuthenticatedQueryPolicy(ctx: QueryCtx, policy: AppAuthenticatedPolicy) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertAuthenticatedViewerAccess(policy.access, viewer);

  return { viewer: appViewer };
}

async function applyQueryPolicy(ctx: QueryCtx, policy: AppFunctionPolicy) {
  if (policy.access === "access_public") {
    return await applyPublicQueryPolicy(ctx);
  }
  return await applyAuthenticatedQueryPolicy(ctx, policy);
}

async function applyPublicMutationPolicy(ctx: MutationCtx) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertPublicViewerAccess(viewer);

  return { viewer: appViewer };
}

async function applyAuthenticatedMutationPolicy(ctx: MutationCtx, policy: AppAuthenticatedPolicy) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertAuthenticatedViewerAccess(policy.access, viewer);

  return { viewer: appViewer };
}

async function applyMutationPolicy(ctx: MutationCtx, policy: AppFunctionPolicy) {
  if (policy.access === "access_public") {
    return await applyPublicMutationPolicy(ctx);
  }
  return await applyAuthenticatedMutationPolicy(ctx, policy);
}

export const resolveViewerForAction = internalQuery({
  args: {},
  returns: vResolvedViewer,
  handler: async (ctx): Promise<ResolvedViewer> => {
    return await resolveViewerFromDb(ctx);
  },
});

// Builder exports: keep the raw Convex builders private behind app access policy.
const queryBuilder = customQuery(
  baseQuery,
  customCtx(async (ctx, policy: AppFunctionPolicy) => {
    return await applyQueryPolicy(ctx, policy);
  }),
);

const mutationBuilder = customMutation(
  baseMutation,
  customCtx(async (ctx, policy: AppFunctionPolicy) => {
    return await applyMutationPolicy(ctx, policy);
  }),
);

const actionBuilder = customAction(
  baseAction,
  customCtx(async (ctx, policy: AppFunctionPolicy) => {
    const viewer: ResolvedViewer = await ctx.runQuery(
      internal.functions.resolveViewerForAction,
      {},
    );

    if (policy.access === "access_public") {
      const appViewer = assertPublicViewerAccess(viewer);
      return { viewer: appViewer };
    }

    const appViewer = assertAuthenticatedViewerAccess(policy.access, viewer);
    return { viewer: appViewer };
  }),
);

// @ts-expect-error Convex helpers expose one union ctx; this facade narrows it from definition.access.
export const query: AppFunctionBuilder<"query", QueryCtx, PublicAppViewer, AuthenticatedAppViewer> =
  queryBuilder;

// @ts-expect-error Convex helpers expose one union ctx; this facade narrows it from definition.access.
export const mutation: AppFunctionBuilder<
  "mutation",
  MutationCtx,
  PublicAppViewer,
  AuthenticatedAppViewer
> = mutationBuilder;

// @ts-expect-error Convex helpers expose one union ctx; this facade narrows it from definition.access.
export const action: AppFunctionBuilder<
  "action",
  ActionCtx,
  PublicAppViewer,
  AuthenticatedAppViewer
> = actionBuilder;
