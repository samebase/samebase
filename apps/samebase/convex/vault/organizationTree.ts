import { v } from "convex/values";

import { mutation, query } from "../functions";
import {
  listOrganizationIdsForUser,
  requireOrganizationAccessContext,
} from "../organizationAccess";
import { vVaultOrganizationTreeSetting } from "./organizationTreeModel";
import { requireRepositoryOperationStart } from "../repositoryMigration/maintenance";

const { array, boolean, id } = v;

const vVaultOrganizationTreeSettings = array(vVaultOrganizationTreeSetting);

export const getVaultOrganizationTreeSettings = query({
  access: "access_dashboard",
  args: {},
  returns: vVaultOrganizationTreeSettings,
  handler: async (ctx) => {
    const organizationIds = await listOrganizationIdsForUser(ctx.db, ctx.viewer.userId);
    const settings = [];

    for (const organizationId of organizationIds) {
      const setting = await ctx.db
        .query("ui_vaultOrganizationTree_settings")
        .withIndex("by_userId_and_organizationId", (indexQuery) =>
          indexQuery.eq("userId", ctx.viewer.userId).eq("organizationId", organizationId),
        )
        .unique();
      if (setting) {
        settings.push({ collapsed: setting.collapsed, organizationId: setting.organizationId });
      }
    }

    return settings.sort((left, right) => left.organizationId.localeCompare(right.organizationId));
  },
});

export const setVaultOrganizationCollapsed = mutation({
  access: "access_dashboard",
  args: { collapsed: boolean(), organizationId: id("organizations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    await requireRepositoryOperationStart(ctx);
    const existing = await ctx.db
      .query("ui_vaultOrganizationTree_settings")
      .withIndex("by_userId_and_organizationId", (indexQuery) =>
        indexQuery.eq("userId", ctx.viewer.userId).eq("organizationId", args.organizationId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { collapsed: args.collapsed });
    } else {
      await ctx.db.insert("ui_vaultOrganizationTree_settings", {
        collapsed: args.collapsed,
        organizationId: args.organizationId,
        userId: ctx.viewer.userId,
      });
    }
    return null;
  },
});
