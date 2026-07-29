"use node";

import { v, type Infer } from "convex/values";
import { internalAction } from "../_generated/server";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
import { cloudflareListAccountsContract } from "../vault/contracts/cloudflareListAccounts";
import {
  cloudflareAttachWorkersContract,
  cloudflareDiscoverWorkersContract,
} from "../vault/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../vault/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../vault/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../vault/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";
import { retryProviderWriteRecoveryContract } from "../vault/contracts/retryProviderWriteRecovery";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";
import { buildAgentBrowserHandoffUrl } from "../../shared/agentBrowserHandoff";
import {
  createAppForUser,
  connectRepositoryForUser,
  retryInfrastructureProvisioningForUser,
  retryProviderWriteRecoveryForUser,
} from "../vault/actions";
import { attachExistingProjectsForUser, discoverProjectsForUser } from "../vault/convex";
import {
  AGENT_BROWSER_HANDOFF_TTL_MS,
  createAgentBrowserHandoffTokenValue,
  sha256Hex,
} from "../mcp/tokens";
import {
  attachExistingCloudflareWorkersForUser,
  discoverCloudflareWorkersForUser,
  listCloudflareAccountsForUser,
  configureWorkersBuildsForGitHubForUser,
  rotateConvexDeployKeysForWorkersBuildsForUser,
} from "../vault/cloudflare";
import { internal } from "../_generated/api";
import { mcpScopeAllowsAccess } from "./mcpScopes";

const { array, id, literal, null: nullValue, object, optional, string, union } = v;
const toolStatus = union(literal("ok"), literal("error"), literal("blocked"));

const createRepositoryToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(createRepositoryContract.structuredContent),
});
type CreateRepositoryToolResult = Infer<typeof createRepositoryToolResultValidator>;

const getUserVaultsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(getUserVaultsContract.structuredContent),
});
type GetUserVaultsToolResult = Infer<typeof getUserVaultsToolResultValidator>;

const createBrowserHandoffToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(createBrowserHandoffContract.structuredContent),
});
type CreateBrowserHandoffToolResult = Infer<typeof createBrowserHandoffToolResultValidator>;

export const createRepositoryTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...createRepositoryContract.args,
  }),
  returns: createRepositoryToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...createRepositoryArgs },
  ): Promise<CreateRepositoryToolResult> => {
    if (!mcpScopeAllowsAccess(createRepositoryContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${createRepositoryContract.mcp.name}.`,
      };
    }

    try {
      const structuredContent = await createAppForUser(ctx, createRepositoryArgs);
      return {
        status: "ok",
        text: JSON.stringify(structuredContent, null, 2),
        structuredContent,
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

export const getUserVaultsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
  }),
  returns: getUserVaultsToolResultValidator,
  handler: async (ctx, args): Promise<GetUserVaultsToolResult> => {
    if (!mcpScopeAllowsAccess(getUserVaultsContract.access, args.grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${getUserVaultsContract.mcp.name}.`,
      };
    }

    try {
      const vaults = await ctx.runQuery(internal.vault.dashboard.getUserVaultsForUser, {
        userId: args.userId,
      });
      return {
        status: "ok",
        text: `Found ${vaults.length} ${vaults.length === 1 ? "vault" : "vaults"}.`,
        structuredContent: {
          vaults,
        },
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

const connectRepositoryToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(connectRepositoryContract.structuredContent),
});
type ConnectRepositoryToolResult = Infer<typeof connectRepositoryToolResultValidator>;

export const connectRepositoryTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...connectRepositoryContract.args,
  }),
  returns: connectRepositoryToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...connectRepositoryArgs },
  ): Promise<ConnectRepositoryToolResult> => {
    if (!mcpScopeAllowsAccess(connectRepositoryContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${connectRepositoryContract.mcp.name}.`,
      };
    }

    try {
      const structuredContent = await connectRepositoryForUser(ctx, connectRepositoryArgs);
      return {
        status: "ok",
        text: JSON.stringify(structuredContent, null, 2),
        structuredContent,
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

const convexDiscoverProjectsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(convexDiscoverProjectsContract.structuredContent),
});
type ConvexDiscoverProjectsToolResult = Infer<typeof convexDiscoverProjectsToolResultValidator>;

export const convexDiscoverProjectsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...convexDiscoverProjectsContract.args,
  }),
  returns: convexDiscoverProjectsToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...discoveryArgs },
  ): Promise<ConvexDiscoverProjectsToolResult> => {
    if (!mcpScopeAllowsAccess(convexDiscoverProjectsContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${convexDiscoverProjectsContract.mcp.name}.`,
      };
    }

    try {
      const structuredContent = await discoverProjectsForUser(ctx, discoveryArgs);
      return {
        status: "ok",
        text: `Found ${structuredContent.projects.length} ${structuredContent.projects.length === 1 ? "project" : "projects"} and ${structuredContent.source.locations.length} code ${structuredContent.source.locations.length === 1 ? "location" : "locations"}.`,
        structuredContent,
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

const cloudflareListAccountsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(cloudflareListAccountsContract.structuredContent),
});
type CloudflareListAccountsToolResult = Infer<typeof cloudflareListAccountsToolResultValidator>;

export const cloudflareListAccountsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareListAccountsContract.args,
  }),
  returns: cloudflareListAccountsToolResultValidator,
  handler: async (ctx, { grantedScopes, userId }): Promise<CloudflareListAccountsToolResult> => {
    if (!mcpScopeAllowsAccess(cloudflareListAccountsContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareListAccountsContract.mcp.name}.`,
      };
    }

    try {
      const accounts = await listCloudflareAccountsForUser(ctx, { userId });
      return {
        status: "ok",
        text: `Found ${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}.`,
        structuredContent: {
          accounts,
        },
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

const cloudflareDiscoverWorkersToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(cloudflareDiscoverWorkersContract.structuredContent),
});
type CloudflareDiscoverWorkersToolResult = Infer<
  typeof cloudflareDiscoverWorkersToolResultValidator
>;

export const cloudflareDiscoverWorkersTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareDiscoverWorkersContract.args,
  }),
  returns: cloudflareDiscoverWorkersToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...discoveryArgs },
  ): Promise<CloudflareDiscoverWorkersToolResult> => {
    if (!mcpScopeAllowsAccess(cloudflareDiscoverWorkersContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareDiscoverWorkersContract.mcp.name}.`,
      };
    }

    try {
      const structuredContent = await discoverCloudflareWorkersForUser(ctx, discoveryArgs);
      return {
        status: "ok",
        text: `Found ${structuredContent.workers.length} ${structuredContent.workers.length === 1 ? "worker" : "workers"} in a ${structuredContent.inventoryState} inventory.`,
        structuredContent,
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

const convexAttachProjectsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(convexAttachProjectsContract.structuredContent),
});
type ConvexAttachProjectsToolResult = Infer<typeof convexAttachProjectsToolResultValidator>;

export const convexAttachProjectsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...convexAttachProjectsContract.args,
  }),
  returns: convexAttachProjectsToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...attachmentArgs },
  ): Promise<ConvexAttachProjectsToolResult> => {
    if (!mcpScopeAllowsAccess(convexAttachProjectsContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${convexAttachProjectsContract.mcp.name}.`,
      };
    }

    try {
      const convexProjectIds = await attachExistingProjectsForUser(ctx, attachmentArgs);
      return {
        status: "ok",
        text: `Attached ${convexProjectIds.length} Convex ${convexProjectIds.length === 1 ? "project" : "projects"}.`,
        structuredContent: { convexProjectIds },
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

const cloudflareAttachWorkersToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(cloudflareAttachWorkersContract.structuredContent),
});
type CloudflareAttachWorkersToolResult = Infer<typeof cloudflareAttachWorkersToolResultValidator>;

export const cloudflareAttachWorkersTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareAttachWorkersContract.args,
  }),
  returns: cloudflareAttachWorkersToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...attachmentArgs },
  ): Promise<CloudflareAttachWorkersToolResult> => {
    if (!mcpScopeAllowsAccess(cloudflareAttachWorkersContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareAttachWorkersContract.mcp.name}.`,
      };
    }

    try {
      const workerIds = await attachExistingCloudflareWorkersForUser(ctx, attachmentArgs);
      return {
        status: "ok",
        text: `Attached ${workerIds.length} Cloudflare ${workerIds.length === 1 ? "Worker" : "Workers"}.`,
        structuredContent: { workerIds },
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

const cloudflareConfigureWorkersBuildsForGitHubToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type CloudflareConfigureWorkersBuildsForGitHubToolResult = Infer<
  typeof cloudflareConfigureWorkersBuildsForGitHubToolResultValidator
>;

export const cloudflareConfigureWorkersBuildsForGitHubTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareConfigureWorkersBuildsForGitHubContract.args,
  }),
  returns: cloudflareConfigureWorkersBuildsForGitHubToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...operationArgs },
  ): Promise<CloudflareConfigureWorkersBuildsForGitHubToolResult> => {
    if (
      !mcpScopeAllowsAccess(cloudflareConfigureWorkersBuildsForGitHubContract.access, grantedScopes)
    ) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareConfigureWorkersBuildsForGitHubContract.mcp.name}.`,
      };
    }

    try {
      await configureWorkersBuildsForGitHubForUser(ctx, operationArgs);
      return {
        status: "ok",
        text: "Configured Workers Builds for GitHub.",
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

const cloudflareRotateConvexDeployKeysForWorkersBuildsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type CloudflareRotateConvexDeployKeysForWorkersBuildsToolResult = Infer<
  typeof cloudflareRotateConvexDeployKeysForWorkersBuildsToolResultValidator
>;

export const cloudflareRotateConvexDeployKeysForWorkersBuildsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareRotateConvexDeployKeysForWorkersBuildsContract.args,
  }),
  returns: cloudflareRotateConvexDeployKeysForWorkersBuildsToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...operationArgs },
  ): Promise<CloudflareRotateConvexDeployKeysForWorkersBuildsToolResult> => {
    if (
      !mcpScopeAllowsAccess(
        cloudflareRotateConvexDeployKeysForWorkersBuildsContract.access,
        grantedScopes,
      )
    ) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name}.`,
      };
    }

    try {
      await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, operationArgs);
      return {
        status: "ok",
        text: "Rotated Convex deploy keys for Workers Builds.",
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

// Current provider state is observed live; there is no verification mutation tool.

const retryProviderWriteRecoveryToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type RetryProviderWriteRecoveryToolResult = Infer<
  typeof retryProviderWriteRecoveryToolResultValidator
>;

export const retryProviderWriteRecoveryTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...retryProviderWriteRecoveryContract.args,
  }),
  returns: retryProviderWriteRecoveryToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...retryArgs },
  ): Promise<RetryProviderWriteRecoveryToolResult> => {
    if (!mcpScopeAllowsAccess(retryProviderWriteRecoveryContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${retryProviderWriteRecoveryContract.mcp.name}.`,
      };
    }

    try {
      await retryProviderWriteRecoveryForUser(ctx, retryArgs);
      return {
        status: "ok",
        text: "Retried provider recovery.",
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

const retryInfrastructureProvisioningToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type RetryInfrastructureProvisioningToolResult = Infer<
  typeof retryInfrastructureProvisioningToolResultValidator
>;

export const retryInfrastructureProvisioningTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...retryInfrastructureProvisioningContract.args,
  }),
  returns: retryInfrastructureProvisioningToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...retryArgs },
  ): Promise<RetryInfrastructureProvisioningToolResult> => {
    if (!mcpScopeAllowsAccess(retryInfrastructureProvisioningContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${retryInfrastructureProvisioningContract.mcp.name}.`,
      };
    }

    try {
      await retryInfrastructureProvisioningForUser(ctx, retryArgs);
      return {
        status: "ok",
        text: "Started retry_infrastructure_provisioning run.",
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

export const createBrowserHandoffTool = internalAction({
  args: object({
    userId: id("users"),
    grantId: string(),
    clientId: string(),
    grantedScopes: array(string()),
    ...createBrowserHandoffContract.args,
  }),
  returns: createBrowserHandoffToolResultValidator,
  handler: async (ctx, args): Promise<CreateBrowserHandoffToolResult> => {
    if (!args.grantedScopes.includes(createBrowserHandoffContract.access)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${createBrowserHandoffContract.mcp.name}.`,
      };
    }

    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) {
      return {
        status: "error",
        text: "SITE_URL must be configured to create browser handoff URLs.",
      };
    }

    const now = Date.now();
    const expiresAt = now + AGENT_BROWSER_HANDOFF_TTL_MS;
    const token = createAgentBrowserHandoffTokenValue();
    const tokenHash = await sha256Hex(token);
    let url: string;
    try {
      url = buildAgentBrowserHandoffUrl({
        returnToPath: args.returnToPath,
        siteUrl,
        token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid SITE_URL.";
      return {
        status: "error",
        text: message,
      };
    }

    const result = await ctx.runMutation(internal.agentBrowserHandoff.createForMcp, {
      tokenHash,
      userId: args.userId,
      grantId: args.grantId,
      clientId: args.clientId,
      createdAt: now,
      expiresAt,
    });

    if (!result.ok) {
      return {
        status: "error",
        text: `Could not create browser handoff: ${result.reason}.`,
      };
    }

    const structuredContent = {
      url,
      expiresAt,
    };
    return {
      status: "ok",
      text: JSON.stringify(structuredContent, null, 2),
      structuredContent,
    };
  },
});
