import { Infer, v } from "convex/values";
import { type MutationCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";

const { boolean, literal, object, union } = v;

const vBillingCycle = union(literal("monthly"), literal("annual"));
export type BillingCycle = Infer<typeof vBillingCycle>;
const vChatOpenScope = union(literal("global"), literal("vault"));
type ChatOpenScope = Infer<typeof vChatOpenScope>;

const DEFAULT_PRICING_BILLING_CYCLE: BillingCycle = "monthly";

const vDashboardSettings = object({
  accountPanelOpen: boolean(),
  providersPanelOpen: boolean(),
  pricingBillingCycle: vBillingCycle,
  // Vault/editor routes own the repository-scoped dock.
  editorChatOpen: boolean(),
  // Dashboard and floating non-vault routes share the global dock state.
  globalChatOpen: boolean(),
});

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
  access: "access_dashboard",
  args: {},
  returns: vDashboardSettings,
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("dashboardSettings")
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
      editorChatOpen: existing?.editorChatOpen ?? false,
      globalChatOpen: existing?.globalChatOpen ?? false,
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

export const setEditorChatOpen = mutation({
  access: "access_dashboard",
  args: {
    isOpen: boolean(),
    scope: vChatOpenScope,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertDashboardSettings(
      ctx,
      ctx.viewer.userId,
      getChatOpenPatch(args.scope, args.isOpen),
    );
  },
});
