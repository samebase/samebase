import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { action, query } from "./functions";
import { listOrganizationIdsForUser } from "./organizationAccess";
import { readOrganizationRepositories } from "./repository/dashboard";
import { connectRepositoryContract } from "./repository/contracts/connectRepository";
import { createRepositoryContract } from "./repository/contracts/createRepository";
import {
  getRepositoryStatusContract,
  type RepositoryStatus,
} from "./repository/contracts/getRepositoryStatus";
import {
  getUserRepositoriesContract,
  type UserRepositoriesResult,
} from "./repository/contracts/getUserRepositories";
import { retryInfrastructureProvisioningContract } from "./repository/contracts/retryInfrastructureProvisioning";
import type { ConfirmationSurface } from "./repository/confirmationModel";
import type {
  ActionConfirmation,
  ActionConfirmationRequest,
} from "./repository/contracts/actionConfirmation";
import { canAccess } from "../shared/accessModel";

const { id } = v;
type CreateRepositoryResult = Infer<typeof createRepositoryContract.returns>;
type ConnectRepositoryResult = Infer<typeof connectRepositoryContract.returns>;

/*
Repository-level actions for the dashboard and MCP. This module runs in the default runtime because
`list` is a query. `getStatus`, `create`, and `connect` call one internal Node action each, because
their handlers in repository/status.ts and repository/actions.ts use Octokit and provider clients.
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

export const getStatus = action({
  access: getRepositoryStatusContract.access,
  args: getRepositoryStatusContract.args,
  returns: getRepositoryStatusContract.returns,
  mcp: getRepositoryStatusContract.mcp,
  handler: async (ctx, args): Promise<RepositoryStatus> =>
    await ctx.runAction(internal.repository.status.readForUser, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
    }),
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

/**
The gated retry: the first call returns the confirmation request and starts nothing. The annotated
return type breaks a type cycle through `internal`, which includes this module.
*/
export async function retryProviderSetupForUser(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    surface: ConfirmationSurface;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ActionConfirmationRequest | null> {
  return await ctx.runMutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    surface: args.surface,
    confirmation: args.confirmation,
  });
}

export const retryProviderSetup = action({
  access: retryInfrastructureProvisioningContract.access,
  args: retryInfrastructureProvisioningContract.args,
  returns: retryInfrastructureProvisioningContract.returns,
  mcp: retryInfrastructureProvisioningContract.mcp,
  handler: async (ctx, args): Promise<ActionConfirmationRequest | null> =>
    await retryProviderSetupForUser(ctx, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      surface: { kind: "dashboard" },
      confirmation: args.confirmation,
    }),
});
