import { ConvexError, Infer, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { query } from "./functions";
import {
  readBillingAccountState,
  requireBillingAccountForUser,
  type BillingAccountTarget,
} from "./organizationBilling";

const { id, literal, null: nullValue, number, object, union } = v;

const FREE_RESOURCE_ATTACHMENT_LIMIT = 5;
const PRO_RESOURCE_ATTACHMENT_LIMIT = 40;
const RESOURCE_USAGE_READ_LIMIT = PRO_RESOURCE_ATTACHMENT_LIMIT + 1;
// Phase 1 creates one-member organizations and migrates one measured two-member operator account.
// Phase 3 removes this bound with the legacy attachment fallback.
const PHASE_ONE_MIXED_STATE_MEMBER_LIMIT = 2;

const vBillingResourceKind = union(literal("cloudflare_worker"), literal("convex_project"));
type BillingResourceKind = Infer<typeof vBillingResourceKind>;
type BillingResourceReadCtx = Pick<QueryCtx, "db">;

const vResourceAttachmentCount = union(
  object({
    state: literal("exact"),
    count: number(),
  }),
  object({
    state: literal("at_least"),
    count: number(),
  }),
);

const vResourceAttachmentUsage = object({
  used: vResourceAttachmentCount,
  limit: number(),
});

const vBillingResourceUsage = object({
  cloudflareWorkers: vResourceAttachmentUsage,
  convexProjects: vResourceAttachmentUsage,
});
export type BillingResourceUsage = Infer<typeof vBillingResourceUsage>;

function readResourceAttachmentLimit(target: BillingAccountTarget): number {
  const account = readBillingAccountState(target);
  return account.plan === "pro" && (account.status === "active" || account.status === "past_due")
    ? PRO_RESOURCE_ATTACHMENT_LIMIT
    : FREE_RESOURCE_ATTACHMENT_LIMIT;
}

async function readLegacyResourceAttachmentCount(
  ctx: BillingResourceReadCtx,
  args: {
    kind: BillingResourceKind;
    userId: Id<"users">;
    maximumRows: number;
  },
): Promise<number> {
  switch (args.kind) {
    case "cloudflare_worker":
      return (
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .take(args.maximumRows)
      ).length;
    case "convex_project":
      return (
        await ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .take(args.maximumRows)
      ).length;
    default:
      args.kind satisfies never;
      return 0;
  }
}

async function readOrganizationResourceAttachmentCount(
  ctx: BillingResourceReadCtx,
  args: {
    kind: BillingResourceKind;
    organizationId: Id<"organizations">;
    maximumRows: number;
  },
): Promise<number> {
  let count: number;
  switch (args.kind) {
    case "cloudflare_worker":
      count = (
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
          .take(args.maximumRows)
      ).length;
      break;
    case "convex_project":
      count = (
        await ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
          .take(args.maximumRows)
      ).length;
      break;
    default:
      args.kind satisfies never;
      return 0;
  }
  if (count === args.maximumRows) {
    return count;
  }

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .take(PHASE_ONE_MIXED_STATE_MEMBER_LIMIT + 1);
  if (memberships.length > PHASE_ONE_MIXED_STATE_MEMBER_LIMIT) {
    throw new Error(
      "Phase 1 mixed-state quota fallback supports at most two organization members.",
    );
  }

  for (const membership of memberships) {
    const remainingRows = args.maximumRows - count;
    let legacyRowCount: number;
    switch (args.kind) {
      case "cloudflare_worker":
        legacyRowCount = (
          await ctx.db
            .query("vaultCloudflareWorkers")
            .withIndex("by_user_and_organization", (query) =>
              query.eq("userId", membership.userId).eq("organizationId", undefined),
            )
            .take(remainingRows)
        ).length;
        break;
      case "convex_project":
        legacyRowCount = (
          await ctx.db
            .query("vaultConvexProjects")
            .withIndex("by_user_and_organization", (query) =>
              query.eq("userId", membership.userId).eq("organizationId", undefined),
            )
            .take(remainingRows)
        ).length;
        break;
      default:
        args.kind satisfies never;
        return 0;
    }
    count += legacyRowCount;
    if (count === args.maximumRows) {
      return count;
    }
  }

  return count;
}

async function readResourceAttachmentCount(
  ctx: BillingResourceReadCtx,
  args: {
    kind: BillingResourceKind;
    target: BillingAccountTarget;
    maximumRows: number;
  },
): Promise<number> {
  if (args.target.kind === "legacy_user") {
    return await readLegacyResourceAttachmentCount(ctx, {
      kind: args.kind,
      userId: args.target.account._id,
      maximumRows: args.maximumRows,
    });
  }

  return await readOrganizationResourceAttachmentCount(ctx, {
    kind: args.kind,
    organizationId: args.target.account.organizationId,
    maximumRows: args.maximumRows,
  });
}

function throwBillingResourceLimit(kind: BillingResourceKind, limit: number): never {
  switch (kind) {
    case "cloudflare_worker":
      throw new ConvexError(`Cloudflare Worker attachment limit reached (${limit}).`);
    case "convex_project":
      throw new ConvexError(`Convex project attachment limit reached (${limit}).`);
    default:
      kind satisfies never;
      throw new Error("Unsupported billing resource kind.");
  }
}

export async function requireBillingResourceCapacity(
  ctx: BillingResourceReadCtx,
  args: {
    kind: BillingResourceKind;
    userId: Id<"users">;
  },
): Promise<void> {
  const billing = await requireBillingAccountForUser(ctx.db, args.userId);
  const limit = readResourceAttachmentLimit(billing.target);
  const used = await readResourceAttachmentCount(ctx, {
    kind: args.kind,
    target: billing.target,
    maximumRows: limit + 1,
  });
  if (used >= limit) {
    throwBillingResourceLimit(args.kind, limit);
  }
}

export const requireBillingResourceCapacityForProviderCreate = internalQuery({
  args: {
    userId: id("users"),
    kind: vBillingResourceKind,
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await requireBillingResourceCapacity(ctx, args);
    return null;
  },
});

export const getViewerBillingResourceUsage = query({
  access: "access_user_preferences",
  args: {},
  returns: vBillingResourceUsage,
  handler: async (ctx): Promise<BillingResourceUsage> => {
    const billing = await requireBillingAccountForUser(ctx.db, ctx.viewer.userId);
    const limit = readResourceAttachmentLimit(billing.target);
    const [cloudflareWorkers, convexProjects] = await Promise.all([
      readResourceAttachmentCount(ctx, {
        kind: "cloudflare_worker",
        target: billing.target,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
      readResourceAttachmentCount(ctx, {
        kind: "convex_project",
        target: billing.target,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
    ]);

    const toUsageCount = (count: number) =>
      count === RESOURCE_USAGE_READ_LIMIT
        ? { state: "at_least" as const, count }
        : { state: "exact" as const, count };

    return {
      cloudflareWorkers: { used: toUsageCount(cloudflareWorkers), limit },
      convexProjects: { used: toUsageCount(convexProjects), limit },
    };
  },
});
