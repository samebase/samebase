import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { action, query } from "./functions";
import { listOrganizationIdsForUser } from "./organizationAccess";
import { readOrganizationRepositories } from "./repository/dashboard";
import { isLiveConnectedRepository, isSamebaseManagedRepository } from "./repository/state";
import { connectRepositoryContract } from "./repository/contracts/connectRepository";
import { createRepositoryContract } from "./repository/contracts/createRepository";
import {
  getUserRepositoriesContract,
  type UserRepositoriesResult,
} from "./repository/contracts/getUserRepositories";
import { retryInfrastructureProvisioningContract } from "./repository/contracts/retryInfrastructureProvisioning";
import { canAccess } from "../shared/accessModel";

const { id } = v;
type CreateRepositoryResult = Infer<typeof createRepositoryContract.returns>;
type ConnectRepositoryResult = Infer<typeof connectRepositoryContract.returns>;

/*
Repository-level actions for the dashboard and MCP. This module runs in the default runtime because
`list` is a query. `create` and `connect` call one internal Node action each, because their
handlers in repository/actions.ts use Octokit.
*/

export const list = query({
  access: getUserRepositoriesContract.access,
  args: getUserRepositoriesContract.args,
  returns: getUserRepositoriesContract.returns,
  mcp: getUserRepositoriesContract.mcp,
  handler: async (ctx): Promise<UserRepositoriesResult> => {
    const organizationIds = await listOrganizationIdsForUser(ctx.db, ctx.viewer.userId);
    return await readOrganizationRepositories(ctx, organizationIds);
  },
});

/** The `list` read for an MCP caller, whose user ID comes from the verified bearer token. */
export const listForUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: getUserRepositoriesContract.returns,
  handler: async (ctx, args): Promise<UserRepositoriesResult> => {
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: args.userId,
    });
    if (viewer.user === null || !canAccess(getUserRepositoriesContract.access, viewer.accessKeys)) {
      throw new Error("Access denied");
    }

    const organizationIds = await listOrganizationIdsForUser(ctx.db, args.userId);
    return await readOrganizationRepositories(ctx, organizationIds);
  },
});

export const create = action({
  access: createRepositoryContract.access,
  args: createRepositoryContract.args,
  returns: createRepositoryContract.returns,
  mcp: createRepositoryContract.mcp,
  handler: async (ctx, args): Promise<CreateRepositoryResult> =>
    await ctx.runAction(internal.repository.actions.create, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
      githubRepositoryName: args.githubRepositoryName,
      convexProjectName: args.convexProjectName,
      convexDeploymentRegion: args.convexDeploymentRegion,
      cloudflareWorkerName: args.cloudflareWorkerName,
      cloudflareBuildTokenUuid: args.cloudflareBuildTokenUuid,
      description: args.description,
      private: args.private,
    }),
});

export const connect = action({
  access: connectRepositoryContract.access,
  args: connectRepositoryContract.args,
  returns: connectRepositoryContract.returns,
  mcp: connectRepositoryContract.mcp,
  handler: async (ctx, args): Promise<ConnectRepositoryResult> =>
    await ctx.runAction(internal.repository.actions.connect, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    }),
});

export async function retryProviderSetupForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<null> {
  const repository = await ctx.runQuery(internal.repository.records.getByIdForUser, {
    userId: args.userId,
    repositoryId: args.repositoryId,
  });
  if (!repository) {
    throw new Error("Repository not found");
  }
  if (!isLiveConnectedRepository(repository) || !isSamebaseManagedRepository(repository)) {
    throw new Error(
      "Infrastructure retry is available only for live Samebase-managed repositories",
    );
  }

  await ctx.runMutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
    userId: args.userId,
    repositoryId: args.repositoryId,
  });
  return null;
}

export const retryProviderSetup = action({
  access: retryInfrastructureProvisioningContract.access,
  args: retryInfrastructureProvisioningContract.args,
  returns: retryInfrastructureProvisioningContract.returns,
  mcp: retryInfrastructureProvisioningContract.mcp,
  handler: async (ctx, args): Promise<null> =>
    await retryProviderSetupForUser(ctx, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
    }),
});
