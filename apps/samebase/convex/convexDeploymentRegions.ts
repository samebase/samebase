import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, mutation, query } from "./functions";
import { listConvexManagementDeploymentRegions } from "./convexManagementApi/client";
import { vConvexDeploymentRegion } from "./convexDeploymentRegionModel";
import { resolveDefaultConvexDeploymentRegion } from "../shared/convexDeploymentRegions";
import {
  requireOrganizationMembershipRecord,
  requireOrganizationOwnerAccessContext,
} from "./organizationAccess";
import { convexListDeploymentRegionsContract } from "./vault/contracts/convexDeploymentRegions";

type ConvexDeploymentRegionsResult = Infer<typeof convexListDeploymentRegionsContract.returns>;

export async function listConvexDeploymentRegionsForUser(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
  },
): Promise<ConvexDeploymentRegionsResult> {
  const configuration = await ctx.runQuery(
    internal.organizationProviderCredentials.loadForOrganization,
    {
      userId: args.userId,
      organizationId: args.organizationId,
    },
  );
  const team = configuration.convexTeam;
  const credential = configuration.convexCredential;
  const token = credential?.auth.credential.trim();
  const teamId = team?.teamId.trim();
  if (!team || !credential || !token || !teamId) {
    throw new Error("A connected Convex team is required to list production regions.");
  }

  return {
    defaultRegion: resolveDefaultConvexDeploymentRegion(
      configuration.defaultConvexDeploymentRegion,
    ),
    regions: await listConvexManagementDeploymentRegions({ token, teamId }),
  };
}

export const list = action({
  access: convexListDeploymentRegionsContract.access,
  args: convexListDeploymentRegionsContract.args,
  returns: convexListDeploymentRegionsContract.returns,
  mcp: convexListDeploymentRegionsContract.mcp,
  handler: async (ctx, args): Promise<ConvexDeploymentRegionsResult> => {
    return await listConvexDeploymentRegionsForUser(ctx, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
  },
});

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
