"use node";

import {
  ConvexError,
  v,
  type Infer,
  type ObjectType,
  type PropertyValidators,
} from "convex/values";
import type { ReturnValueForOptionalValidator } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { createRepositoryContract } from "../repository/contracts/createRepository";
import { getUserRepositoriesContract } from "../repository/contracts/getUserRepositories";
import { connectRepositoryContract } from "../repository/contracts/connectRepository";
import {
  cloudflareAttachWorkersContract,
  cloudflareCreateWorkerContract,
  cloudflareDiscoverWorkersContract,
} from "../repository/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../repository/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../repository/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../repository/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../repository/contracts/retryInfrastructureProvisioning";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";
import {
  MAX_FEEDBACK_REPORT_LENGTH,
  submitFeedbackContract,
} from "../mcp/contracts/submitFeedback";
import { cloudflareListWorkersBuildTokensContract } from "../repository/contracts/cloudflareBuildTokens";
import { buildAgentBrowserHandoffUrl } from "../../shared/agentBrowserHandoff";
import type { AccessKey } from "../../shared/accessModel";
import {
  createAppForUser,
  connectRepositoryForUser,
  retryInfrastructureProvisioningForUser,
} from "../repository/actions";
import { attachExistingProjectsForUser, discoverProjectsForUser } from "../repository/convex";
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
} from "../repository/cloudflare";
import { internal } from "../_generated/api";
import { mcpScopeAllowsAccess } from "./mcpScopes";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { listWorkersBuildTokensForUser } from "../cloudflareBuildTokens";
import { sendEmail } from "../email";
import { publicMcpErrorMessage } from "../mcp/publicErrors";

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
        return {
          status: "error",
          text: publicMcpErrorMessage(error),
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
    const result = await createAppForUser(ctx, {
      ...createArgs,
      target: { kind: "owner", githubOwnerLogin },
    });
    const structuredContent = { repositoryId: result.repositoryId };
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

export const getUserRepositoriesTool = defineMcpTool({
  contract: getUserRepositoriesContract,
  args: getUserRepositoriesContract.args,
  successFields: {
    structuredContent: getUserRepositoriesContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repositoriesWithOrganizationIds = await ctx.runQuery(
      internal.repository.dashboard.getUserRepositoriesForUser,
      {
        userId: args.userId,
      },
    );
    const repositories: Infer<
      typeof getUserRepositoriesContract.structuredContent
    >["repositories"] = repositoriesWithOrganizationIds.map((repository) => {
      const plan = repository.providerPlan;
      let pendingCloudflareSetup: Infer<
        typeof getUserRepositoriesContract.structuredContent
      >["repositories"][number]["pendingCloudflareSetup"] = null;
      if (
        plan &&
        plan.cloudflare.state === "planned" &&
        plan.cloudflare.buildTokenUuid === null &&
        plan.convex.state === "created" &&
        repository.cloudflareWorkers.length === 0
      ) {
        const plannedProjectId = plan.convex.projectId;
        const plannedTeamId = plan.convex.teamId;
        const project = repository.convexProjects.find(
          (attachment) =>
            attachment.projectId === plannedProjectId &&
            attachment.teamId === plannedTeamId &&
            attachment.codeLocation.kind === "config" &&
            attachment.codeLocation.convexConfigPath === plan.convexConfigPath,
        );
        if (project) {
          pendingCloudflareSetup = {
            workerName: plan.cloudflare.workerName,
            rootDirectory: plan.cloudflare.rootDirectory,
            convexProjectId: project.convexProjectId,
          };
        }
      }

      return {
        repositoryId: repository.repositoryId,
        cloudflareAccountId: repository.cloudflareAccountId,
        githubOwnerLogin: repository.githubOwnerLogin,
        githubRepositoryName: repository.githubRepositoryName,
        githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
        githubRepositoryFullName: repository.githubRepositoryFullName,
        sourceSetup:
          repository.sourceSetup.status === "failed"
            ? {
                status: repository.sourceSetup.status,
                message: "Source setup failed. Check this app in Samebase for recovery steps.",
              }
            : { status: repository.sourceSetup.status },
        providerSetup:
          repository.providerSetup.status === "failed"
            ? {
                status: repository.providerSetup.status,
                provider: repository.providerSetup.provider,
                message: "Provider setup failed. Check this app in Samebase before retrying.",
              }
            : { status: repository.providerSetup.status },
        pendingCloudflareSetup,
        deletion: { state: repository.deletion.state },
        isSamebaseManaged: repository.isSamebaseManaged,
        cloudflareWorkers: repository.cloudflareWorkers,
        convexProjects: repository.convexProjects,
      };
    });
    return {
      text: `Found ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}.`,
      structuredContent: { repositories },
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
    const result = await connectRepositoryForUser(ctx, {
      userId: args.userId,
      target: { kind: "owner", githubOwnerLogin: args.githubOwnerLogin },
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    });
    const structuredContent = {
      repositoryId: result.repositoryId,
      githubRepositoryFullName: result.githubRepositoryFullName,
    };
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
    const discovery = await discoverProjectsForUser(ctx, args);
    const structuredContent: Infer<typeof convexDiscoverProjectsContract.structuredContent> = {
      source: {
        completeness: discovery.source.completeness,
        locations: discovery.source.locations.map((location) =>
          location.kind === "config"
            ? {
                kind: location.kind,
                convexConfigPath: location.convexConfigPath,
                blobSha: location.blobSha,
              }
            : {
                kind: location.kind,
                convexDirectoryPath: location.convexDirectoryPath,
                convexDirectoryTreeSha: location.convexDirectoryTreeSha,
                packageJsonBlobSha: location.packageJsonBlobSha,
              },
        ),
      },
      projects: discovery.projects.map((project) => ({
        attachment: project.attachment,
        teamId: project.teamId,
        projectId: project.projectId,
        projectName: project.projectName,
        productionDeployment: project.productionDeployment,
      })),
    };
    const attachableCount = structuredContent.projects.filter(
      (project) => project.attachment === "attachable",
    ).length;
    return {
      text: `Found ${structuredContent.projects.length} ${structuredContent.projects.length === 1 ? "project" : "projects"} (${attachableCount} attachable) and ${structuredContent.source.locations.length} code ${structuredContent.source.locations.length === 1 ? "location" : "locations"}.`,
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
    const attachableCount = structuredContent.workers.filter(
      (worker) => worker.attachment === "attachable",
    ).length;
    return {
      text: `Found ${structuredContent.workers.length} ${structuredContent.workers.length === 1 ? "worker" : "workers"} in a ${structuredContent.inventoryState} inventory, ${attachableCount} attachable.`,
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
      throw new ConvexError("Feedback report cannot be empty.");
    }
    if (args.report.length > MAX_FEEDBACK_REPORT_LENGTH) {
      throw new ConvexError(
        `Feedback report must be ${MAX_FEEDBACK_REPORT_LENGTH} characters or fewer.`,
      );
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
      throw new ConvexError("Feedback email is not configured in local development.");
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
      return {
        status: "error",
        text: publicMcpErrorMessage(error),
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
