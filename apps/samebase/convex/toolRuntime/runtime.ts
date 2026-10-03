"use node";

import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
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
import { retryProviderSetupForUser } from "../repository";
import { createAppForUser, connectRepositoryForUser } from "../repository/actions";
import { attachExistingProjectsForUser, discoverProjectsForUser } from "../repository/convex";
import {
  attachExistingCloudflareWorkersForUser,
  createWorkerForUser,
  discoverCloudflareWorkersForUser,
  configureWorkersBuildsForGitHubForUser,
  rotateConvexDeployKeysForWorkersBuildsForUser,
} from "../repository/cloudflare";
import { defineMcpTool } from "./mcpTool";

/*
The MCP side of the tools that the dashboard also calls. Each tool maps its MCP arguments to the
same handler that the dashboard function at its tool name runs. The MCP-only tools live at their
own function paths: account.ts and feedback.ts.
*/

export const repositoryCreateTool = defineMcpTool({
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

export const repositoryListTool = defineMcpTool({
  contract: getUserRepositoriesContract,
  args: getUserRepositoriesContract.args,
  successFields: {
    structuredContent: getUserRepositoriesContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repositoriesWithOrganizationIds = await ctx.runQuery(internal.repository.listForUser, {
      userId: args.userId,
    });
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

export const repositoryConnectTool = defineMcpTool({
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

export const convexFindProjectsTool = defineMcpTool({
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

export const cloudflareFindWorkersTool = defineMcpTool({
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

export const convexAttachProjectTool = defineMcpTool({
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

export const cloudflareConfigureBuildsTool = defineMcpTool({
  contract: cloudflareConfigureWorkersBuildsForGitHubContract,
  args: cloudflareConfigureWorkersBuildsForGitHubContract.args,
  successFields: {},
  run: async (ctx, args) => {
    await configureWorkersBuildsForGitHubForUser(ctx, args);
    return { text: "Configured Workers Builds for GitHub." };
  },
});

export const cloudflareRotateConvexDeployKeysTool = defineMcpTool({
  contract: cloudflareRotateConvexDeployKeysForWorkersBuildsContract,
  args: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.args,
  successFields: {},
  run: async (ctx, args) => {
    await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, args);
    return { text: "Rotated Convex deploy keys for Workers Builds." };
  },
});

// Current provider state is observed live; there is no verification mutation tool.

export const repositoryRetryProviderSetupTool = defineMcpTool({
  contract: retryInfrastructureProvisioningContract,
  args: retryInfrastructureProvisioningContract.args,
  successFields: {},
  run: async (ctx, args) => {
    await retryProviderSetupForUser(ctx, args);
    return { text: "Started a provider setup retry." };
  },
});
