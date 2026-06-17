import { getAuthUserId } from "@convex-dev/auth/server";
import { MINUTE, RateLimiter, type RateLimitConfig } from "@convex-dev/rate-limiter";
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getConnectionByUserAndKind } from "./providerConnections";
import { hasAppAccess, isAdminUser } from "./userAccess";
import { canAccess, type AccessKey, type ViewerRole } from "../shared/accessModel";

const { id, literal, null: vNull, object, union } = v;

const RATE_LIMITS = {
  manualRepositoryRefresh: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 3,
  },
} satisfies Record<string, RateLimitConfig>;

type RateLimitName = keyof typeof RATE_LIMITS;
type RateLimitTarget = "global" | "viewer";

type QueryRateLimitPolicy = {
  mode: "check";
  name: RateLimitName;
  target: RateLimitTarget;
  count?: number;
};

type ConsumingRateLimitPolicy = {
  mode: "consume";
  name: RateLimitName;
  target: RateLimitTarget;
  count?: number;
};

type AppQueryPolicy = {
  access: AccessKey;
  rateLimit?: QueryRateLimitPolicy;
};

type AppWritePolicy = {
  access: AccessKey;
  rateLimit?: ConsumingRateLimitPolicy;
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

const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMITS);

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

function getRateLimitKey(target: RateLimitTarget, viewer: ResolvedViewer): string | undefined {
  switch (target) {
    case "global":
      return undefined;
    case "viewer":
      if (viewer.userId === null) {
        throw new Error("User not authenticated");
      }
      return viewer.userId;
    default: {
      target satisfies never;
      return undefined;
    }
  }
}

async function applyQueryPolicy(ctx: QueryCtx, policy: AppQueryPolicy) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertViewerAccess(policy.access, viewer);

  if (policy.rateLimit) {
    await rateLimiter.check(ctx, policy.rateLimit.name, {
      key: getRateLimitKey(policy.rateLimit.target, viewer),
      count: policy.rateLimit.count,
      throws: true,
    });
  }

  return { viewer: appViewer };
}

async function applyMutationPolicy(ctx: MutationCtx, policy: AppWritePolicy) {
  const viewer = await resolveViewerFromDb(ctx);
  const appViewer = assertViewerAccess(policy.access, viewer);

  if (policy.rateLimit) {
    await rateLimiter.limit(ctx, policy.rateLimit.name, {
      key: getRateLimitKey(policy.rateLimit.target, viewer),
      count: policy.rateLimit.count,
      throws: true,
    });
  }

  return { viewer: appViewer };
}

export const resolveViewerForAction = internalQuery({
  args: {},
  returns: vResolvedViewer,
  handler: async (ctx): Promise<ResolvedViewer> => {
    return await resolveViewerFromDb(ctx);
  },
});

export const appFunction = {
  query: customQuery(
    query,
    customCtx(async (ctx, policy: AppQueryPolicy) => {
      return await applyQueryPolicy(ctx, policy);
    }),
  ),
  mutation: customMutation(
    mutation,
    customCtx(async (ctx, policy: AppWritePolicy) => {
      return await applyMutationPolicy(ctx, policy);
    }),
  ),
  action: customAction(
    action,
    customCtx(async (ctx, policy: AppWritePolicy) => {
      const viewer: ResolvedViewer = await ctx.runQuery(
        internal.functions.resolveViewerForAction,
        {},
      );
      const appViewer = assertViewerAccess(policy.access, viewer);

      if (policy.rateLimit) {
        await rateLimiter.limit(ctx, policy.rateLimit.name, {
          key: getRateLimitKey(policy.rateLimit.target, viewer),
          count: policy.rateLimit.count,
          throws: true,
        });
      }

      return { viewer: appViewer };
    }),
  ),
};
