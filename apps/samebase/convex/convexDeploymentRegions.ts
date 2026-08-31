import { v } from "convex/values";

import { mutation, query } from "./functions";
import { vConvexDeploymentRegion } from "./convexDeploymentRegionModel";
import { resolveDefaultConvexDeploymentRegion } from "../shared/convexDeploymentRegions";
import {
  requireOrganizationMembershipRecord,
  requireOrganizationOwnerAccessContext,
} from "./organizationAccess";

export const getDefault = query({
  access: "access_dashboard",
  args: {
    organizationId: v.id("organizations"),
  },
  returns: vConvexDeploymentRegion,
  handler: async (ctx, args) => {
    await requireOrganizationMembershipRecord(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    return resolveDefaultConvexDeploymentRegion(organization.defaultConvexDeploymentRegion);
  },
});

export const setDefault = mutation({
  access: "access_dashboard",
  args: {
    organizationId: v.id("organizations"),
    deploymentRegion: vConvexDeploymentRegion,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    await ctx.db.patch(args.organizationId, {
      defaultConvexDeploymentRegion: args.deploymentRegion,
    });
    return null;
  },
});
