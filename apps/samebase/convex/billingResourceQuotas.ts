import { ConvexError, Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { query } from "./functions";
import {
  readBillingAccountState,
  requireBillingAccountForOrganization,
} from "./organizationBilling";

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

function readResourceAttachmentLimit(account: Doc<"organizationBillingAccounts">): number {
  const state = readBillingAccountState(account);
  return state.plan === "pro" && (state.status === "active" || state.status === "past_due")
    ? PRO_RESOURCE_ATTACHMENT_LIMIT
    : FREE_RESOURCE_ATTACHMENT_LIMIT;
}

async function readResourceAttachmentCount(
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
  return count;
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
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  },
): Promise<void> {
  const billing = await requireBillingAccountForOrganization(ctx.db, args);
  const limit = readResourceAttachmentLimit(billing.account);
  const used = await readResourceAttachmentCount(ctx, {
    kind: args.kind,
    organizationId: billing.account.organizationId,
    maximumRows: limit + 1,
  });
  if (used >= limit) {
    throwBillingResourceLimit(args.kind, limit);
  }
}

export const requireBillingResourceCapacityForProviderCreate = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
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
  args: {
    organizationId: id("organizations"),
  },
  returns: vBillingResourceUsage,
  handler: async (ctx, args): Promise<BillingResourceUsage> => {
    const billing = await requireBillingAccountForOrganization(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const limit = readResourceAttachmentLimit(billing.account);
    const [cloudflareWorkers, convexProjects] = await Promise.all([
      readResourceAttachmentCount(ctx, {
        kind: "cloudflare_worker",
        organizationId: billing.account.organizationId,
        maximumRows: RESOURCE_USAGE_READ_LIMIT,
      }),
      readResourceAttachmentCount(ctx, {
        kind: "convex_project",
        organizationId: billing.account.organizationId,
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
