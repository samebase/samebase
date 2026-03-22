import { Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const { boolean, literal, null: vNull, object, union } = v;

const billingCycleValidator = union(literal("monthly"), literal("annual"));
export type BillingCycle = Infer<typeof billingCycleValidator>;

const DEFAULT_PRICING_BILLING_CYCLE: BillingCycle = "monthly";

const dashboardSettingsValidator = object({
  providersPanelOpen: boolean(),
  accountPanelOpen: boolean(),
  newProjectPanelOpen: boolean(),
  pricingBillingCycle: billingCycleValidator,
});

const getDashboardSettingsArgs = object({});
const getDashboardSettingsReturns = dashboardSettingsValidator;

const setProvidersPanelOpenArgs = object({
  isOpen: boolean(),
});
const setProvidersPanelOpenReturns = vNull();

const setAccountPanelOpenArgs = object({
  isOpen: boolean(),
});
const setAccountPanelOpenReturns = vNull();

const setNewProjectPanelOpenArgs = object({
  isOpen: boolean(),
});
const setNewProjectPanelOpenReturns = vNull();

const setPricingBillingCycleArgs = object({
  billingCycle: billingCycleValidator,
});
const setPricingBillingCycleReturns = vNull();

type GetDashboardSettingsArgs = Infer<typeof getDashboardSettingsArgs>;
type SetProvidersPanelOpenArgs = Infer<typeof setProvidersPanelOpenArgs>;
type SetAccountPanelOpenArgs = Infer<typeof setAccountPanelOpenArgs>;
type SetNewProjectPanelOpenArgs = Infer<typeof setNewProjectPanelOpenArgs>;
type SetPricingBillingCycleArgs = Infer<typeof setPricingBillingCycleArgs>;
type DashboardSettings = Infer<typeof dashboardSettingsValidator>;

export const getDashboardSettings = query({
  args: getDashboardSettingsArgs,
  returns: getDashboardSettingsReturns,
  handler: async (
    ctx,
    _args: GetDashboardSettingsArgs,
  ): Promise<DashboardSettings> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        providersPanelOpen: false,
        accountPanelOpen: false,
        newProjectPanelOpen: false,
        pricingBillingCycle: DEFAULT_PRICING_BILLING_CYCLE,
      };
    }

    const existing = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const rawBillingCycle = existing?.pricingBillingCycle;
    const pricingBillingCycle: BillingCycle =
      rawBillingCycle === "monthly" || rawBillingCycle === "annual"
        ? rawBillingCycle
        : DEFAULT_PRICING_BILLING_CYCLE;

    return {
      providersPanelOpen: existing?.providersPanelOpen ?? false,
      accountPanelOpen: existing?.accountPanelOpen ?? false,
      newProjectPanelOpen: existing?.newProjectPanelOpen ?? false,
      pricingBillingCycle,
    };
  },
});

export const setProvidersPanelOpen = mutation({
  args: setProvidersPanelOpenArgs,
  returns: setProvidersPanelOpenReturns,
  handler: async (ctx, args: SetProvidersPanelOpenArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const existing = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        providersPanelOpen: args.isOpen,
      });
    } else {
      await ctx.db.insert("dashboardSettings", {
        userId,
        providersPanelOpen: args.isOpen,
        accountPanelOpen: false,
        newProjectPanelOpen: false,
      });
    }

    return null;
  },
});

export const setAccountPanelOpen = mutation({
  args: setAccountPanelOpenArgs,
  returns: setAccountPanelOpenReturns,
  handler: async (ctx, args: SetAccountPanelOpenArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const existing = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accountPanelOpen: args.isOpen,
      });
    } else {
      await ctx.db.insert("dashboardSettings", {
        userId,
        providersPanelOpen: false,
        accountPanelOpen: args.isOpen,
        newProjectPanelOpen: false,
      });
    }

    return null;
  },
});

export const setNewProjectPanelOpen = mutation({
  args: setNewProjectPanelOpenArgs,
  returns: setNewProjectPanelOpenReturns,
  handler: async (ctx, args: SetNewProjectPanelOpenArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const existing = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        newProjectPanelOpen: args.isOpen,
      });
    } else {
      await ctx.db.insert("dashboardSettings", {
        userId,
        providersPanelOpen: false,
        accountPanelOpen: false,
        newProjectPanelOpen: args.isOpen,
      });
    }

    return null;
  },
});

export const setPricingBillingCycle = mutation({
  args: setPricingBillingCycleArgs,
  returns: setPricingBillingCycleReturns,
  handler: async (ctx, args: SetPricingBillingCycleArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const existing = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        pricingBillingCycle: args.billingCycle,
      });
    } else {
      await ctx.db.insert("dashboardSettings", {
        userId,
        providersPanelOpen: false,
        accountPanelOpen: false,
        newProjectPanelOpen: false,
        pricingBillingCycle: args.billingCycle,
      });
    }

    return null;
  },
});
