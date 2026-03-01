import { Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const { boolean, null: vNull, object } = v;

const dashboardSettingsValidator = object({
  providersPanelOpen: boolean(),
});

const getDashboardSettingsArgs = object({});
const getDashboardSettingsReturns = dashboardSettingsValidator;

const setProvidersPanelOpenArgs = object({
  isOpen: boolean(),
});
const setProvidersPanelOpenReturns = vNull();

type GetDashboardSettingsArgs = Infer<typeof getDashboardSettingsArgs>;
type SetProvidersPanelOpenArgs = Infer<typeof setProvidersPanelOpenArgs>;

export const getDashboardSettings = query({
  args: getDashboardSettingsArgs,
  returns: getDashboardSettingsReturns,
  handler: async (ctx, _args: GetDashboardSettingsArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { providersPanelOpen: false };
    }

    const existing = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      providersPanelOpen: existing?.providersPanelOpen ?? false,
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
      });
    }

    return null;
  },
});
