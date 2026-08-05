"use node";

import { v, type Infer, type ObjectType, type PropertyValidators } from "convex/values";
import type { ReturnValueForOptionalValidator } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
import { cloudflareListAccountsContract } from "../vault/contracts/cloudflareListAccounts";
import {
  cloudflareAttachWorkersContract,
  cloudflareCreateWorkerContract,
  cloudflareDiscoverWorkersContract,
} from "../vault/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../vault/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../vault/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../vault/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";
import type { AccessKey } from "../../shared/accessModel";
import {
  createAppForUser,
  connectRepositoryForUser,
  retryInfrastructureProvisioningForUser,
} from "../vault/actions";
import { attachExistingProjectsForUser, discoverProjectsForUser } from "../vault/convex";
import {
  attachExistingCloudflareWorkersForUser,
  createWorkerForUser,
  discoverCloudflareWorkersForUser,
  listCloudflareAccountsForUser,
  configureWorkersBuildsForGitHubForUser,
  rotateConvexDeployKeysForWorkersBuildsForUser,
} from "../vault/cloudflare";
import { internal } from "../_generated/api";
import { mcpScopeAllowsAccess } from "./mcpScopes";

const { array, id, literal, object, string, union } = v;
const vToolInvocationArgs = {
  userId: id("users"),
  organizationId: id("organizations"),
  grantedScopes: array(string()),
};
const vToolFailure = object({
  status: union(literal("error"), literal("blocked")),
  text: string(),
});

type McpToolContract<Args extends PropertyValidators> = {
  access: AccessKey;
  args: Args;
  mcp: { name: string };
};

type RegisteredMcpToolArgs<Args extends PropertyValidators> = ObjectType<Args> & {
  userId: Id<"users">;
  organizationId: Id<"organizations">;
  grantedScopes: string[];
};
type McpToolArgs<Args extends PropertyValidators> = Omit<
  RegisteredMcpToolArgs<Args>,
  "grantedScopes"
>;

function defineMcpTool<
  const Args extends PropertyValidators,
  const SuccessFields extends PropertyValidators,
>(config: {
  contract: McpToolContract<Args>;
  successFields: SuccessFields;
  run: (
    ctx: ActionCtx,
    args: McpToolArgs<Args>,
  ) => Promise<ObjectType<SuccessFields> & { text: string }>;
}) {
  const vToolSuccess = object({
    ...config.successFields,
    status: literal("ok"),
    text: string(),
  });
  const vToolResult = union(vToolSuccess, vToolFailure);
  const vToolArgs = object({
    ...config.contract.args,
    ...vToolInvocationArgs,
  });
  type ToolReturn = ReturnValueForOptionalValidator<typeof vToolResult>;

  return internalAction<
    typeof vToolArgs,
    typeof vToolResult,
    ToolReturn,
    [Infer<typeof vToolArgs>]
  >({
    args: vToolArgs,
    returns: vToolResult,
    // @ts-expect-error vToolArgs validates these contract and trusted fields before the handler.
    handler: async (ctx, args: RegisteredMcpToolArgs<Args>) => {
      const { grantedScopes, ...toolArgs } = args;
      if (!mcpScopeAllowsAccess(config.contract.access, grantedScopes)) {
        return {
          status: "blocked",
          text: `Insufficient scope for ${config.contract.mcp.name}.`,
        };
      }

      try {
        return {
          ...(await config.run(ctx, toolArgs)),
          status: "ok",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool execution failed.";
        return {
          status: "error",
          text: message,
        };
      }
    },
  });
}

async function requireMcpVaultOrganization(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    vaultId: Id<"vaults">;
  },
): Promise<void> {
  const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
    userId: args.userId,
    vaultId: args.vaultId,
  });
  if (vault === null || vault.organizationId !== args.organizationId) {
    throw new Error("Vault not found in the authorized organization.");
  }
}

export const createRepositoryTool = defineMcpTool({
  contract: createRepositoryContract,
  successFields: {
    structuredContent: createRepositoryContract.structuredContent,
  },
  run: async (ctx, args) => {
    const structuredContent = await createAppForUser(ctx, args);
    return {
      text: JSON.stringify(structuredContent, null, 2),
      structuredContent,
    };
  },
});

export const getUserVaultsTool = defineMcpTool({
  contract: getUserVaultsContract,
  successFields: {
    structuredContent: getUserVaultsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const vaults: Infer<typeof getUserVaultsContract.structuredContent>["vaults"] =
      await ctx.runQuery(internal.vault.dashboard.getUserVaultsForUser, {
        userId: args.userId,
        organizationId: args.organizationId,
      });
    return {
      text: `Found ${vaults.length} ${vaults.length === 1 ? "vault" : "vaults"}.`,
      structuredContent: { vaults },
    };
  },
});

export const connectRepositoryTool = defineMcpTool({
  contract: connectRepositoryContract,
  successFields: {
    structuredContent: connectRepositoryContract.structuredContent,
  },
  run: async (ctx, args) => {
    const structuredContent = await connectRepositoryForUser(ctx, args);
    return {
      text: JSON.stringify(structuredContent, null, 2),
      structuredContent,
    };
  },
});

export const convexDiscoverProjectsTool = defineMcpTool({
  contract: convexDiscoverProjectsContract,
  successFields: {
    structuredContent: convexDiscoverProjectsContract.structuredContent,
  },
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    const structuredContent = await discoverProjectsForUser(ctx, args);
    return {
      text: `Found ${structuredContent.projects.length} ${structuredContent.projects.length === 1 ? "project" : "projects"} and ${structuredContent.source.locations.length} code ${structuredContent.source.locations.length === 1 ? "location" : "locations"}.`,
      structuredContent,
    };
  },
});

export const cloudflareListAccountsTool = defineMcpTool({
  contract: cloudflareListAccountsContract,
  successFields: {
    structuredContent: cloudflareListAccountsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const accounts = await listCloudflareAccountsForUser(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
    });
    return {
      text: `Found ${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}.`,
      structuredContent: { accounts },
    };
  },
});

export const cloudflareCreateWorkerTool = defineMcpTool({
  contract: cloudflareCreateWorkerContract,
  successFields: {
    structuredContent: cloudflareCreateWorkerContract.structuredContent,
  },
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    const workerId = await createWorkerForUser(ctx, args);
    return {
      text: `Created and attached Cloudflare Worker ${args.workerName}.`,
      structuredContent: { workerId },
    };
  },
});

export const cloudflareDiscoverWorkersTool = defineMcpTool({
  contract: cloudflareDiscoverWorkersContract,
  successFields: {
    structuredContent: cloudflareDiscoverWorkersContract.structuredContent,
  },
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    const structuredContent = await discoverCloudflareWorkersForUser(ctx, args);
    return {
      text: `Found ${structuredContent.workers.length} ${structuredContent.workers.length === 1 ? "worker" : "workers"} in a ${structuredContent.inventoryState} inventory.`,
      structuredContent,
    };
  },
});

export const convexAttachProjectsTool = defineMcpTool({
  contract: convexAttachProjectsContract,
  successFields: {
    structuredContent: convexAttachProjectsContract.structuredContent,
  },
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    const convexProjectIds = await attachExistingProjectsForUser(ctx, args);
    return {
      text: `Attached ${convexProjectIds.length} Convex ${convexProjectIds.length === 1 ? "project" : "projects"}.`,
      structuredContent: { convexProjectIds },
    };
  },
});

export const cloudflareAttachWorkersTool = defineMcpTool({
  contract: cloudflareAttachWorkersContract,
  successFields: {
    structuredContent: cloudflareAttachWorkersContract.structuredContent,
  },
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    const workerIds = await attachExistingCloudflareWorkersForUser(ctx, args);
    return {
      text: `Attached ${workerIds.length} Cloudflare ${workerIds.length === 1 ? "Worker" : "Workers"}.`,
      structuredContent: { workerIds },
    };
  },
});

export const cloudflareConfigureWorkersBuildsForGitHubTool = defineMcpTool({
  contract: cloudflareConfigureWorkersBuildsForGitHubContract,
  successFields: {},
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    await configureWorkersBuildsForGitHubForUser(ctx, args);
    return { text: "Configured Workers Builds for GitHub." };
  },
});

export const cloudflareRotateConvexDeployKeysForWorkersBuildsTool = defineMcpTool({
  contract: cloudflareRotateConvexDeployKeysForWorkersBuildsContract,
  successFields: {},
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, args);
    return { text: "Rotated Convex deploy keys for Workers Builds." };
  },
});

// Current provider state is observed live; there is no verification mutation tool.

export const retryInfrastructureProvisioningTool = defineMcpTool({
  contract: retryInfrastructureProvisioningContract,
  successFields: {},
  run: async (ctx, args) => {
    await requireMcpVaultOrganization(ctx, args);
    await retryInfrastructureProvisioningForUser(ctx, args);
    return { text: "Started retry_infrastructure_provisioning run." };
  },
});
