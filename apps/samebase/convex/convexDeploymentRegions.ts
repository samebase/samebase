import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { action, query } from "./functions";
import {
  listConvexManagementDeploymentRegions,
  requireAvailableConvexDeploymentRegion,
} from "./convexManagementApi/client";
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
    defaultRegion: resolveDefaultConvexDeploymentRegion(team.defaultDeploymentRegion),
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
    return resolveDefaultConvexDeploymentRegion(organization.convexTeam?.defaultDeploymentRegion);
  },
});

export const setDefaultForOrganization = internalMutation({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    deploymentRegion: vConvexDeploymentRegion,
    expectedTeamId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: args.userId,
      organizationId: args.organizationId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const team = organization.convexTeam;
    if (team === undefined) {
      throw new Error("Configure a Convex team before saving a default production region.");
    }
    if (team.teamId !== args.expectedTeamId) {
      throw new Error("The Convex team changed before the default production region was saved.");
    }

    await ctx.db.patch(organization._id, {
      convexTeam: {
        teamId: team.teamId,
        ...(team.teamSlug ? { teamSlug: team.teamSlug } : {}),
        defaultDeploymentRegion: args.deploymentRegion,
      },
    });
    return null;
  },
});

export const setDefault = action({
  access: "access_provider_connections",
  args: {
    organizationId: v.id("organizations"),
    deploymentRegion: vConvexDeploymentRegion,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runQuery(internal.organizationAccess.requireOrganizationOwnerIdForUser, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    const team = configuration.convexTeam;
    const credential = configuration.convexCredential;
    const token = credential?.auth.credential.trim();
    const teamId = team?.teamId.trim();
    if (!team || !credential || !token || !teamId) {
      throw new Error("Connect Convex before saving a default production region.");
    }
    await requireAvailableConvexDeploymentRegion({
      token,
      teamId,
      region: args.deploymentRegion,
    });

    await ctx.runMutation(internal.convexDeploymentRegions.setDefaultForOrganization, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
      deploymentRegion: args.deploymentRegion,
      expectedTeamId: teamId,
    });
    return null;
  },
});
