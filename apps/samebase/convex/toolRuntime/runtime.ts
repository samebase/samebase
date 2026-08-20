"use node";

import { v, type Infer, type ObjectType, type PropertyValidators } from "convex/values";
import type { ReturnValueForOptionalValidator } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
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
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";
import { submitFeedbackContract } from "../mcp/contracts/submitFeedback";
import { cloudflareListWorkersBuildTokensContract } from "../vault/contracts/cloudflareBuildTokens";
import { buildAgentBrowserHandoffUrl } from "../../shared/agentBrowserHandoff";
import type { AccessKey } from "../../shared/accessModel";
import {
  createAppForUser,
  connectRepositoryForUser,
  retryInfrastructureProvisioningForUser,
} from "../vault/actions";
import { attachExistingProjectsForUser, discoverProjectsForUser } from "../vault/convex";
import {
  AGENT_BROWSER_HANDOFF_TTL_MS,
  createAgentBrowserHandoffTokenValue,
  sha256Hex,
} from "../mcp/tokens";
import {
  attachExistingCloudflareWorkersForUser,
  createWorkerForUser,
  discoverCloudflareWorkersForUser,
  configureWorkersBuildsForGitHubForUser,
  rotateConvexDeployKeysForWorkersBuildsForUser,
} from "../vault/cloudflare";
import { internal } from "../_generated/api";
import { mcpScopeAllowsAccess } from "./mcpScopes";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { listWorkersBuildTokensForUser } from "../cloudflareBuildTokens";
import { sendEmail } from "../email";

const { array, id, literal, object, string, union } = v;
const vToolInvocationArgs = {
  userId: id("users"),
  grantedScopes: array(string()),
};
const vToolFailure = object({
  status: union(literal("error"), literal("blocked")),
  text: string(),
});

type McpToolContract = {
  access: AccessKey;
  mcp: { name: string };
};

type RegisteredMcpToolArgs<Args extends PropertyValidators> = ObjectType<Args> & {
  userId: Id<"users">;
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
  contract: McpToolContract;
  args: Args;
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
    ...config.args,
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

export const createRepositoryTool = defineMcpTool({
  contract: createRepositoryContract,
  args: createRepositoryContract.mcpArgs,
  successFields: {
    structuredContent: createRepositoryContract.structuredContent,
  },
  run: async (ctx, args) => {
    const { githubOwnerLogin, ...createArgs } = args;
    const structuredContent = await createAppForUser(ctx, {
      ...createArgs,
      target: { kind: "owner", githubOwnerLogin },
    });
    return {
      text: JSON.stringify(structuredContent, null, 2),
      structuredContent,
    };
  },
});

export const cloudflareListWorkersBuildTokensTool = defineMcpTool({
  contract: cloudflareListWorkersBuildTokensContract,
  args: cloudflareListWorkersBuildTokensContract.mcpArgs,
  successFields: {
    structuredContent: cloudflareListWorkersBuildTokensContract.structuredContent,
  },
  run: async (ctx, args) => {
    const githubAccess = await resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "owner", githubOwnerLogin: args.githubOwnerLogin },
    });
    const structuredContent = await listWorkersBuildTokensForUser(ctx, {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
    });
    return {
      text: `Found ${structuredContent.tokens.length} Workers Builds ${structuredContent.tokens.length === 1 ? "token" : "tokens"}.`,
      structuredContent,
    };
  },
});

export const getUserVaultsTool = defineMcpTool({
  contract: getUserVaultsContract,
  args: getUserVaultsContract.args,
  successFields: {
    structuredContent: getUserVaultsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const vaults: Infer<typeof getUserVaultsContract.structuredContent>["vaults"] =
      await ctx.runQuery(internal.vault.dashboard.getUserVaultsForUser, {
        userId: args.userId,
      });
    return {
      text: `Found ${vaults.length} ${vaults.length === 1 ? "vault" : "vaults"}.`,
      structuredContent: { vaults },
    };
  },
});

export const connectRepositoryTool = defineMcpTool({
  contract: connectRepositoryContract,
  args: connectRepositoryContract.mcpArgs,
  successFields: {
    structuredContent: connectRepositoryContract.structuredContent,
  },
  run: async (ctx, args) => {
    const structuredContent = await connectRepositoryForUser(ctx, {
      userId: args.userId,
      target: { kind: "owner", githubOwnerLogin: args.githubOwnerLogin },
      ghRepoId: args.ghRepoId,
    });
    return {
      text: JSON.stringify(structuredContent, null, 2),
      structuredContent,
    };
  },
});

export const convexDiscoverProjectsTool = defineMcpTool({
  contract: convexDiscoverProjectsContract,
  args: convexDiscoverProjectsContract.args,
  successFields: {
    structuredContent: convexDiscoverProjectsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const structuredContent = await discoverProjectsForUser(ctx, args);
    return {
      text: `Found ${structuredContent.projects.length} ${structuredContent.projects.length === 1 ? "project" : "projects"} and ${structuredContent.source.locations.length} code ${structuredContent.source.locations.length === 1 ? "location" : "locations"}.`,
      structuredContent,
    };
  },
});

export const cloudflareCreateWorkerTool = defineMcpTool({
  contract: cloudflareCreateWorkerContract,
  args: cloudflareCreateWorkerContract.args,
  successFields: {
    structuredContent: cloudflareCreateWorkerContract.structuredContent,
  },
  run: async (ctx, args) => {
    const workerId = await createWorkerForUser(ctx, args);
    return {
      text: `Created and attached Cloudflare Worker ${args.workerName}.`,
      structuredContent: { workerId },
    };
  },
});

export const cloudflareDiscoverWorkersTool = defineMcpTool({
  contract: cloudflareDiscoverWorkersContract,
  args: cloudflareDiscoverWorkersContract.args,
  successFields: {
    structuredContent: cloudflareDiscoverWorkersContract.structuredContent,
  },
  run: async (ctx, args) => {
    const structuredContent = await discoverCloudflareWorkersForUser(ctx, args);
    return {
      text: `Found ${structuredContent.workers.length} ${structuredContent.workers.length === 1 ? "worker" : "workers"} in a ${structuredContent.inventoryState} inventory.`,
      structuredContent,
    };
  },
});

export const convexAttachProjectsTool = defineMcpTool({
  contract: convexAttachProjectsContract,
  args: convexAttachProjectsContract.args,
  successFields: {
    structuredContent: convexAttachProjectsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const convexProjectIds = await attachExistingProjectsForUser(ctx, args);
    return {
      text: `Attached ${convexProjectIds.length} Convex ${convexProjectIds.length === 1 ? "project" : "projects"}.`,
      structuredContent: { convexProjectIds },
    };
  },
});

export const cloudflareAttachWorkersTool = defineMcpTool({
  contract: cloudflareAttachWorkersContract,
  args: cloudflareAttachWorkersContract.args,
  successFields: {
    structuredContent: cloudflareAttachWorkersContract.structuredContent,
  },
  run: async (ctx, args) => {
    const workerIds = await attachExistingCloudflareWorkersForUser(ctx, args);
    return {
      text: `Attached ${workerIds.length} Cloudflare ${workerIds.length === 1 ? "Worker" : "Workers"}.`,
      structuredContent: { workerIds },
    };
  },
});

export const cloudflareConfigureWorkersBuildsForGitHubTool = defineMcpTool({
  contract: cloudflareConfigureWorkersBuildsForGitHubContract,
  args: cloudflareConfigureWorkersBuildsForGitHubContract.args,
  successFields: {},
  run: async (ctx, args) => {
    await configureWorkersBuildsForGitHubForUser(ctx, args);
    return { text: "Configured Workers Builds for GitHub." };
  },
});

export const cloudflareRotateConvexDeployKeysForWorkersBuildsTool = defineMcpTool({
  contract: cloudflareRotateConvexDeployKeysForWorkersBuildsContract,
  args: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.args,
  successFields: {},
  run: async (ctx, args) => {
    await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, args);
    return { text: "Rotated Convex deploy keys for Workers Builds." };
  },
});

// Current provider state is observed live; there is no verification mutation tool.

export const retryInfrastructureProvisioningTool = defineMcpTool({
  contract: retryInfrastructureProvisioningContract,
  args: retryInfrastructureProvisioningContract.args,
  successFields: {},
  run: async (ctx, args) => {
    await retryInfrastructureProvisioningForUser(ctx, args);
    return { text: "Started retry_infrastructure_provisioning run." };
  },
});

export const submitFeedbackTool = defineMcpTool({
  contract: submitFeedbackContract,
  args: submitFeedbackContract.args,
  successFields: {},
  run: async (ctx, args) => {
    if (args.report.trim().length === 0) {
      throw new Error("Feedback report cannot be empty.");
    }
    if (args.report.length > 2_000) {
      throw new Error("Feedback report must be 2,000 characters or fewer.");
    }

    await ctx.runMutation(internal.mcp.feedback.reserveFeedbackSend, {
      userId: args.userId,
    });
    const emailResult = await sendEmail({
      to: "contact@samebase.com",
      subject: "Samebase agent feedback",
      text: args.report,
    });
    if (emailResult === "skipped") {
      throw new Error("Feedback email is not configured in local development.");
    }
    return { text: "Feedback submitted to Samebase." };
  },
});

const vCreateBrowserHandoffToolResult = union(
  object({
    status: literal("ok"),
    text: string(),
    structuredContent: createBrowserHandoffContract.structuredContent,
  }),
  vToolFailure,
);
type CreateBrowserHandoffToolResult = Infer<typeof vCreateBrowserHandoffToolResult>;

export const createBrowserHandoffTool = internalAction({
  args: object({
    userId: id("users"),
    grantId: string(),
    clientId: string(),
    grantedScopes: array(string()),
    ...createBrowserHandoffContract.args,
  }),
  returns: vCreateBrowserHandoffToolResult,
  handler: async (ctx, args): Promise<CreateBrowserHandoffToolResult> => {
    if (!args.grantedScopes.includes(createBrowserHandoffContract.access)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${createBrowserHandoffContract.mcp.name}.`,
      };
    }

    const siteUrl = process.env["SITE_URL"];
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
