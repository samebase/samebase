import { Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const { boolean, literal, null: vNull, object, union } = v;

const billingCycleValidator = union(literal("monthly"), literal("annual"));
export type BillingCycle = Infer<typeof billingCycleValidator>;
const chatOpenScopeValidator = union(literal("global"), literal("vault"));
type ChatOpenScope = Infer<typeof chatOpenScopeValidator>;

const DEFAULT_PRICING_BILLING_CYCLE: BillingCycle = "monthly";

const dashboardSettingsValidator = object({
  providersPanelOpen: boolean(),
  // TODO: Why is this necessary? (probably remove it)
  pricingBillingCycle: billingCycleValidator,
  // Vault/editor routes own the repository-scoped dock.
  editorChatOpen: boolean(),
  // Dashboard and floating non-vault routes share the global dock state.
  globalChatOpen: boolean(),
});

const getDashboardSettingsArgs = object({});
const getDashboardSettingsReturns = dashboardSettingsValidator;

const setProvidersPanelOpenArgs = object({
  isOpen: boolean(),
});
const setProvidersPanelOpenReturns = vNull();

const setPricingBillingCycleArgs = object({
  billingCycle: billingCycleValidator,
});
const setPricingBillingCycleReturns = vNull();

const setEditorChatOpenArgs = object({
  isOpen: boolean(),
  scope: chatOpenScopeValidator,
});
const setEditorChatOpenReturns = vNull();

type GetDashboardSettingsArgs = Infer<typeof getDashboardSettingsArgs>;
type SetProvidersPanelOpenArgs = Infer<typeof setProvidersPanelOpenArgs>;
type SetPricingBillingCycleArgs = Infer<typeof setPricingBillingCycleArgs>;
type SetEditorChatOpenArgs = Infer<typeof setEditorChatOpenArgs>;
type DashboardSettings = Infer<typeof dashboardSettingsValidator>;

function getDefaultDashboardSettings(): DashboardSettings {
  return {
    providersPanelOpen: false,
    pricingBillingCycle: DEFAULT_PRICING_BILLING_CYCLE,
    editorChatOpen: false,
    globalChatOpen: false,
  };
}

function getChatOpenPatch(scope: ChatOpenScope, isOpen: boolean) {
  return scope === "vault"
    ? { editorChatOpen: isOpen }
    : { globalChatOpen: isOpen };
}

export const getDashboardSettings = query({
  args: getDashboardSettingsArgs,
  returns: getDashboardSettingsReturns,
  handler: async (
    ctx,
    _args: GetDashboardSettingsArgs,
  ): Promise<DashboardSettings> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return getDefaultDashboardSettings();
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
      pricingBillingCycle,
      editorChatOpen: existing?.editorChatOpen ?? false,
      globalChatOpen: existing?.globalChatOpen ?? false,
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
        ...getDefaultDashboardSettings(),
        providersPanelOpen: args.isOpen,
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
        ...getDefaultDashboardSettings(),
        pricingBillingCycle: args.billingCycle,
      });
    }

    return null;
  },
});

export const setEditorChatOpen = mutation({
  args: setEditorChatOpenArgs,
  returns: setEditorChatOpenReturns,
  handler: async (ctx, args: SetEditorChatOpenArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const existing = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(
        existing._id,
        getChatOpenPatch(args.scope, args.isOpen),
      );
    } else {
      await ctx.db.insert("dashboardSettings", {
        userId,
        ...getDefaultDashboardSettings(),
        ...getChatOpenPatch(args.scope, args.isOpen),
      });
    }

    return null;
  },
});
