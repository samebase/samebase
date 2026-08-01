import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./functions";

const { number, object } = v;

const FREE_RESOURCE_ATTACHMENT_LIMIT = 5;
const PRO_RESOURCE_ATTACHMENT_LIMIT = 40;
const RESOURCE_USAGE_READ_LIMIT = PRO_RESOURCE_ATTACHMENT_LIMIT + 1;

type BillingResourceKind = "cloudflare_worker" | "convex_project";
type BillingResourceReadCtx = Pick<QueryCtx, "db">;

const vResourceAttachmentUsage = object({
  used: number(),
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

export async function requireBillingResourceCapacity(
  ctx: Pick<MutationCtx, "db">,
  args: {
    additionalResources: number;
    kind: BillingResourceKind;
    userId: Id<"users">;
  },
): Promise<void> {
  if (args.additionalResources === 0) {
    return;
  }

  const user = await ctx.db.get(args.userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const limit = readResourceAttachmentLimit(user);
  const used = await readResourceAttachmentCount(ctx, {
    ...args,
    maximumRows: limit + 1,
  });
  if (used + args.additionalResources <= limit) {
    return;
  }

  switch (args.kind) {
    case "cloudflare_worker":
      throw new Error(`Cloudflare Worker attachment limit reached (${limit}).`);
    case "convex_project":
      throw new Error(`Convex project attachment limit reached (${limit}).`);
    default:
      args.kind satisfies never;
      return;
  }
}

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

    return {
      cloudflareWorkers: { used: cloudflareWorkers, limit },
      convexProjects: { used: convexProjects, limit },
    };
  },
});
