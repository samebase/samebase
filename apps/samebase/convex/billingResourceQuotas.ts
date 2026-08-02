import { ConvexError, Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { query } from "./functions";

const { id, literal, null: nullValue, number, object, union } = v;

const FREE_RESOURCE_ATTACHMENT_LIMIT = 5;
const PRO_RESOURCE_ATTACHMENT_LIMIT = 40;
const RESOURCE_USAGE_READ_LIMIT = PRO_RESOURCE_ATTACHMENT_LIMIT + 1;

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

function readResourceAttachmentLimit(
  user: Pick<Doc<"users">, "billingPlan" | "billingStatus">,
): number {
  return user.billingPlan === "pro" &&
    (user.billingStatus === "active" || user.billingStatus === "past_due")
    ? PRO_RESOURCE_ATTACHMENT_LIMIT
    : FREE_RESOURCE_ATTACHMENT_LIMIT;
}

async function readResourceAttachmentCount(
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
  const user = await ctx.db.get(args.userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const limit = readResourceAttachmentLimit(user);
  const used = await readResourceAttachmentCount(ctx, {
    kind: args.kind,
    userId: args.userId,
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
    const limit = readResourceAttachmentLimit(ctx.viewer.user);
    const [cloudflareWorkers, convexProjects] = await Promise.all([
      readResourceAttachmentCount(ctx, {
        kind: "cloudflare_worker",
        userId: ctx.viewer.userId,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
      readResourceAttachmentCount(ctx, {
        kind: "convex_project",
        userId: ctx.viewer.userId,
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
