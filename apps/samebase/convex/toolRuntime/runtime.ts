"use node";

import { v, type Infer } from "convex/values";
import { internalAction } from "../_generated/server";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
import { convexListProjectsContract } from "../vault/contracts/convexListProjects";
import { cloudflareListAccountsContract } from "../vault/contracts/cloudflareListAccounts";
import { cloudflareListWorkersContract } from "../vault/contracts/cloudflareListWorkers";
import { convexConnectExistingProjectContract } from "../vault/contracts/convexConnectExistingProject";
import { cloudflareConnectExistingWorkerContract } from "../vault/contracts/cloudflareConnectExistingWorker";
import { cloudflareWireBuildsContract } from "../vault/contracts/cloudflareWireBuilds";
import { cloudflareWireConvexBuildAccessContract } from "../vault/contracts/cloudflareWireConvexBuildAccess";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";
import { buildAgentBrowserHandoffUrl } from "../../shared/agentBrowserHandoff";
import {
  createAppForUser,
  connectRepositoryForUser,
  retryInfrastructureProvisioningForUser,
} from "../vault/actions";
import { listConvexProjectsForUser, connectExistingConvexProjectForUser } from "../vault/convex";
import {
  AGENT_BROWSER_HANDOFF_TTL_MS,
  createAgentBrowserHandoffTokenValue,
  sha256Hex,
} from "../mcp/tokens";
import {
  listCloudflareAccountsForUser,
  listCloudflareWorkersForUser,
  connectExistingCloudflareWorkerForUser,
  wireCloudflareBuildsForUser,
  wireCloudflareConvexBuildAccessForUser,
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

const convexListProjectsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(convexListProjectsContract.structuredContent),
});
type ConvexListProjectsToolResult = Infer<typeof convexListProjectsToolResultValidator>;

export const convexListProjectsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...convexListProjectsContract.args,
  }),
  returns: convexListProjectsToolResultValidator,
  handler: async (ctx, { grantedScopes, userId }): Promise<ConvexListProjectsToolResult> => {
    if (!mcpScopeAllowsAccess(convexListProjectsContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${convexListProjectsContract.mcp.name}.`,
      };
    }

    try {
      const projects = await listConvexProjectsForUser(ctx, { userId });
      return {
        status: "ok",
        text: `Found ${projects.length} ${projects.length === 1 ? "project" : "projects"}.`,
        structuredContent: {
          projects,
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

const cloudflareListWorkersToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(cloudflareListWorkersContract.structuredContent),
});
type CloudflareListWorkersToolResult = Infer<typeof cloudflareListWorkersToolResultValidator>;

export const cloudflareListWorkersTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareListWorkersContract.args,
  }),
  returns: cloudflareListWorkersToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...cloudflareListWorkersArgs },
  ): Promise<CloudflareListWorkersToolResult> => {
    if (!mcpScopeAllowsAccess(cloudflareListWorkersContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareListWorkersContract.mcp.name}.`,
      };
    }

    try {
      const workers = await listCloudflareWorkersForUser(ctx, cloudflareListWorkersArgs);
      return {
        status: "ok",
        text: `Found ${workers.length} ${workers.length === 1 ? "worker" : "workers"}.`,
        structuredContent: {
          workers,
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

const convexConnectExistingProjectToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type ConvexConnectExistingProjectToolResult = Infer<
  typeof convexConnectExistingProjectToolResultValidator
>;

export const convexConnectExistingProjectTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...convexConnectExistingProjectContract.args,
  }),
  returns: convexConnectExistingProjectToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...connectArgs },
  ): Promise<ConvexConnectExistingProjectToolResult> => {
    if (!mcpScopeAllowsAccess(convexConnectExistingProjectContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${convexConnectExistingProjectContract.mcp.name}.`,
      };
    }

    try {
      await connectExistingConvexProjectForUser(ctx, connectArgs);
      return {
        status: "ok",
        text: "Attached the Convex project.",
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

const cloudflareConnectExistingWorkerToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type CloudflareConnectExistingWorkerToolResult = Infer<
  typeof cloudflareConnectExistingWorkerToolResultValidator
>;

export const cloudflareConnectExistingWorkerTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareConnectExistingWorkerContract.args,
  }),
  returns: cloudflareConnectExistingWorkerToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...connectArgs },
  ): Promise<CloudflareConnectExistingWorkerToolResult> => {
    if (!mcpScopeAllowsAccess(cloudflareConnectExistingWorkerContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareConnectExistingWorkerContract.mcp.name}.`,
      };
    }

    try {
      await connectExistingCloudflareWorkerForUser(ctx, connectArgs);
      return {
        status: "ok",
        text: "Attached the Cloudflare Worker.",
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

const cloudflareWireBuildsToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type CloudflareWireBuildsToolResult = Infer<typeof cloudflareWireBuildsToolResultValidator>;

export const cloudflareWireBuildsTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareWireBuildsContract.args,
  }),
  returns: cloudflareWireBuildsToolResultValidator,
  handler: async (ctx, { grantedScopes, ...wireArgs }): Promise<CloudflareWireBuildsToolResult> => {
    if (!mcpScopeAllowsAccess(cloudflareWireBuildsContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareWireBuildsContract.mcp.name}.`,
      };
    }

    try {
      await wireCloudflareBuildsForUser(ctx, wireArgs);
      return {
        status: "ok",
        text: "Configured Cloudflare Workers Builds.",
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

const cloudflareWireConvexBuildAccessToolResultValidator = object({
  status: toolStatus,
  text: string(),
  structuredContent: optional(nullValue()),
});
type CloudflareWireConvexBuildAccessToolResult = Infer<
  typeof cloudflareWireConvexBuildAccessToolResultValidator
>;

export const cloudflareWireConvexBuildAccessTool = internalAction({
  args: object({
    userId: id("users"),
    grantedScopes: array(string()),
    ...cloudflareWireConvexBuildAccessContract.args,
  }),
  returns: cloudflareWireConvexBuildAccessToolResultValidator,
  handler: async (
    ctx,
    { grantedScopes, ...wireArgs },
  ): Promise<CloudflareWireConvexBuildAccessToolResult> => {
    if (!mcpScopeAllowsAccess(cloudflareWireConvexBuildAccessContract.access, grantedScopes)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${cloudflareWireConvexBuildAccessContract.mcp.name}.`,
      };
    }

    try {
      await wireCloudflareConvexBuildAccessForUser(ctx, wireArgs, { state: "configure" });
      return {
        status: "ok",
        text: "Configured Convex build access.",
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
