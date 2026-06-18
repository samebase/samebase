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
  readAccessKeysForRole,
  type AccessKey,
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

type SignedOutResolvedViewer = {
  role: AnonymousViewerRole;
  accessKeys: AccessKey[];
  userId: Id<"users"> | null;
  user: null;
};

type UserResolvedViewer = {
  role: ViewerRole;
  accessKeys: AccessKey[];
  userId: Id<"users">;
  user: Doc<"users">;
};

type ResolvedViewer = SignedOutResolvedViewer | UserResolvedViewer;

export type PublicAppViewer = ResolvedViewer & {
  requiredAccess: PublicAccessKey;
};

export type AuthenticatedAppViewer = UserResolvedViewer & {
  requiredAccess: AuthenticatedAccessKey;
};

export type AppViewer = PublicAppViewer | AuthenticatedAppViewer;

// Validator mirror for the action runtime hop through resolveViewerForAction.
const vViewerRole = union(literal("role_anonymous"), literal("role_member"), literal("role_staff"));
const vAccessKey = union(
  literal("access_public"),
  literal("access_dashboard"),
  literal("access_provider_connections"),
  literal("access_repo_connect"),
  literal("access_app_create"),
  literal("access_app_refresh"),
  literal("access_files_read"),
  literal("access_files_write"),
  literal("access_machines"),
  literal("access_mcp"),
  literal("access_admin"),
);
const vUserDoc = schema.tables.users.validator.extend({
  _id: id("users"),
  _creationTime: number(),
});

const vSignedOutResolvedViewer = object({
  role: literal("role_anonymous"),
  accessKeys: v.array(vAccessKey),
  userId: union(id("users"), vNull()),
  user: vNull(),
});

const vUserResolvedViewer = object({
  role: vViewerRole,
  accessKeys: v.array(vAccessKey),
  userId: id("users"),
  user: vUserDoc,
});

const vResolvedViewer = union(vSignedOutResolvedViewer, vUserResolvedViewer);

function readViewerAccessKeys(role: ViewerRole): AccessKey[] {
  return [...readAccessKeysForRole(role)];
}

function resolveSignedOutViewer(userId: Id<"users"> | null): SignedOutResolvedViewer {
  const role = "role_anonymous";
  return {
    role,
    accessKeys: readViewerAccessKeys(role),
    userId,
    user: null,
  };
}

function resolveUserViewer(args: {
  role: ViewerRole;
  userId: Id<"users">;
  user: Doc<"users">;
}): UserResolvedViewer {
  return {
    role: args.role,
    accessKeys: readViewerAccessKeys(args.role),
    userId: args.userId,
    user: args.user,
  };
}

// Runtime policy: resolve the current viewer and enforce access keys.
async function resolveViewerFromDb(ctx: QueryCtx | MutationCtx): Promise<ResolvedViewer> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return resolveSignedOutViewer(userId);
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    return resolveSignedOutViewer(userId);
  }

  const githubConnection = await getConnectionByUserAndKind(ctx.db, userId, "github");
  const githubUsername =
    githubConnection?.kind === "github" ? githubConnection.username : undefined;

  if (isAdminUser(githubUsername, user.email)) {
    return resolveUserViewer({ role: "role_staff", userId, user });
  }

  if (
    hasAppAccess({
      githubUsername,
      email: user.email,
      isApproved: user.isApproved,
    })
  ) {
    return resolveUserViewer({ role: "role_member", userId, user });
  }

  return resolveUserViewer({ role: "role_anonymous", userId, user });
}

function assertPublicViewerAccess(viewer: ResolvedViewer): PublicAppViewer {
  if (!canAccess("access_public", viewer.accessKeys)) {
    throw new Error("Access denied");
  }
  return { ...viewer, requiredAccess: "access_public" };
}

function assertAuthenticatedViewerAccess(
  requiredAccess: AuthenticatedAccessKey,
  viewer: ResolvedViewer,
): AuthenticatedAppViewer {
  if (viewer.user === null || !canAccess(requiredAccess, viewer.accessKeys)) {
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
