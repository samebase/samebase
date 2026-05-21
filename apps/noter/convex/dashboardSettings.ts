import { Infer, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

const { boolean, literal, null: vNull, object, union } = v;

const vBillingCycle = union(literal("monthly"), literal("annual"));
export type BillingCycle = Infer<typeof vBillingCycle>;
const vChatOpenScope = union(literal("global"), literal("vault"));
type ChatOpenScope = Infer<typeof vChatOpenScope>;

const DEFAULT_PRICING_BILLING_CYCLE: BillingCycle = "monthly";

const vDashboardSettings = object({
  accountPanelOpen: boolean(),
  providersPanelOpen: boolean(),
  // TODO: Why is this necessary? (probably remove it)
  pricingBillingCycle: vBillingCycle,
  // Vault/editor routes own the repository-scoped dock.
  editorChatOpen: boolean(),
  // Dashboard and floating non-vault routes share the global dock state.
  globalChatOpen: boolean(),
});

const getDashboardSettingsArgs = object({});
const getDashboardSettingsReturns = vDashboardSettings;

const setProvidersPanelOpenArgs = object({
  isOpen: boolean(),
});
const setProvidersPanelOpenReturns = vNull();

const setAccountPanelOpenArgs = object({
  isOpen: boolean(),
});
const setAccountPanelOpenReturns = vNull();

const setPricingBillingCycleArgs = object({
  billingCycle: vBillingCycle,
});
const setPricingBillingCycleReturns = vNull();

const setEditorChatOpenArgs = object({
  isOpen: boolean(),
  scope: vChatOpenScope,
});
const setEditorChatOpenReturns = vNull();

type GetDashboardSettingsArgs = Infer<typeof getDashboardSettingsArgs>;
type SetAccountPanelOpenArgs = Infer<typeof setAccountPanelOpenArgs>;
type SetProvidersPanelOpenArgs = Infer<typeof setProvidersPanelOpenArgs>;
type SetPricingBillingCycleArgs = Infer<typeof setPricingBillingCycleArgs>;
type SetEditorChatOpenArgs = Infer<typeof setEditorChatOpenArgs>;
type DashboardSettings = Infer<typeof vDashboardSettings>;

function getDefaultDashboardSettings(): DashboardSettings {
  return {
    accountPanelOpen: false,
    providersPanelOpen: false,
    pricingBillingCycle: DEFAULT_PRICING_BILLING_CYCLE,
    editorChatOpen: false,
    globalChatOpen: false,
  };
}

function getChatOpenPatch(scope: ChatOpenScope, isOpen: boolean) {
  return scope === "vault" ? { editorChatOpen: isOpen } : { globalChatOpen: isOpen };
}

async function upsertDashboardSettings(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Partial<DashboardSettings>,
) {
  const existing = await ctx.db
    .query("dashboardSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("dashboardSettings", {
    userId,
    ...getDefaultDashboardSettings(),
    ...patch,
  });
}

export const getDashboardSettings = query({
  args: getDashboardSettingsArgs,
  returns: getDashboardSettingsReturns,
  handler: async (ctx, _args: GetDashboardSettingsArgs): Promise<DashboardSettings> => {
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
      accountPanelOpen: existing?.accountPanelOpen ?? false,
      providersPanelOpen: existing?.providersPanelOpen ?? false,
      pricingBillingCycle,
      editorChatOpen: existing?.editorChatOpen ?? false,
      globalChatOpen: existing?.globalChatOpen ?? false,
    };
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

    await upsertDashboardSettings(ctx, userId, {
      accountPanelOpen: args.isOpen,
    });

    return null;
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

    await upsertDashboardSettings(ctx, userId, {
      providersPanelOpen: args.isOpen,
    });

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

    await upsertDashboardSettings(ctx, userId, {
      pricingBillingCycle: args.billingCycle,
    });

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

    await upsertDashboardSettings(ctx, userId, getChatOpenPatch(args.scope, args.isOpen));

    return null;
  },
});
