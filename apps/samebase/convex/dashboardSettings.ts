import { Infer, v } from "convex/values";
import { type MutationCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";

const { boolean, literal, object, union } = v;

const vBillingCycle = union(literal("monthly"), literal("annual"));
export type BillingCycle = Infer<typeof vBillingCycle>;

const DEFAULT_PRICING_BILLING_CYCLE: BillingCycle = "monthly";

const vDashboardSettings = object({
  accountPanelOpen: boolean(),
  providersPanelOpen: boolean(),
  pricingBillingCycle: vBillingCycle,
});

type DashboardSettings = Infer<typeof vDashboardSettings>;

function getDefaultDashboardSettings(): DashboardSettings {
  return {
    accountPanelOpen: false,
    providersPanelOpen: false,
    pricingBillingCycle: DEFAULT_PRICING_BILLING_CYCLE,
  };
}

async function upsertDashboardSettings(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Partial<DashboardSettings>,
) {
  const existing = await ctx.db
    .query("ui_user_settings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("ui_user_settings", {
    userId,
    ...getDefaultDashboardSettings(),
    ...patch,
  });
}

export const getDashboardSettings = query({
  access: "access_dashboard",
  args: {},
  returns: vDashboardSettings,
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("ui_user_settings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.viewer.userId))
      .first();

    const rawBillingCycle = existing?.pricingBillingCycle;
    const pricingBillingCycle: BillingCycle =
      rawBillingCycle === "monthly" || rawBillingCycle === "annual"
        ? rawBillingCycle
        : DEFAULT_PRICING_BILLING_CYCLE;

    return {
      accountPanelOpen: existing?.accountPanelOpen ?? false,
      providersPanelOpen: existing?.providersPanelOpen ?? false,
      pricingBillingCycle,
    };
  },
});

export const setAccountPanelOpen = mutation({
  access: "access_dashboard",
  args: {
    isOpen: boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertDashboardSettings(ctx, ctx.viewer.userId, {
      accountPanelOpen: args.isOpen,
    });
  },
});

export const setPricingBillingCycle = mutation({
  access: "access_dashboard",
  args: {
    billingCycle: vBillingCycle,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertDashboardSettings(ctx, ctx.viewer.userId, {
      pricingBillingCycle: args.billingCycle,
    });
  },
});
