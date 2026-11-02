"use node";

import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { createRepositoryContract } from "../repository/contracts/createRepository";
import {
  getUserRepositoriesContract,
  type UserRepositoryResult,
} from "../repository/contracts/getUserRepositories";
import { connectRepositoryContract } from "../repository/contracts/connectRepository";
import { retryInfrastructureProvisioningContract } from "../repository/contracts/retryInfrastructureProvisioning";
import { getRepositoryStatusContract } from "../repository/contracts/getRepositoryStatus";
import { projectRepositoryStatusForMcp } from "../repository/repositoryStatus";
import { readRepositoryStatusForUser } from "../repository/status";
import { retryProviderSetupForUser } from "../repository";
import { connectRepositoryByFullNameForUser, createAppForUser } from "../repository/actions";
import type { ActionConfirmationRequest } from "../repository/contracts/actionConfirmation";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { toSafeGitHubRepositoryName } from "../../shared/githubRepositoryName";
import { defineMcpTool, mcpGrantArgs } from "./mcpTool";
import { findRepositoryByReference } from "./mcpResolution";

/*
The MCP side of the tools that the dashboard also calls. Each tool resolves its MCP arguments (a
repository as owner/name) into the IDs that the shared handler takes, then runs the same handler
that the dashboard function at its tool name runs. The MCP-only tools live at their own function
paths: account.ts and feedback.ts.
*/

const RETRY_PROVIDER_SETUP_TOOL = retryInfrastructureProvisioningContract.mcp.name;

/** The surface of a gated MCP call: the bearer token's grant and OAuth client. */
function mcpConfirmationSurface(args: { grantId: string; clientId: string }) {
  return { kind: "mcp" as const, grantId: args.grantId, clientId: args.clientId };
}

/**
The first result of a gated tool: nothing changed. The text repeats the token and the sentence,
because some hosts give the model only the text content.
*/
function requestMcpConfirmation(tool: string, request: ActionConfirmationRequest) {
  return {
    text: `Nothing changed yet. ${request.effect} Tell the user this effect. Only after the user approves it, call ${tool} again with the same arguments and confirmation ${JSON.stringify({ token: request.token, acknowledgement: request.acknowledgement })}. The token works once, until ${new Date(request.expiresAt).toISOString()}.`,
    structuredContent: request,
  };
}

async function readRepositoryForMcp(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { userId: Id<"users">; repository: string },
): Promise<UserRepositoryResult> {
  const repositories = await ctx.runQuery(internal.repository.listForUser, {
    userId: args.userId,
  });
  return findRepositoryByReference(repositories, args.repository);
}

export const repositoryListTool = defineMcpTool({
  contract: getUserRepositoriesContract,
  args: getUserRepositoriesContract.args,
  successFields: {
    structuredContent: getUserRepositoriesContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repositories: UserRepositoryResult[] = await ctx.runQuery(
      internal.repository.listForUser,
      { userId: args.userId },
    );
    const structuredContent: Infer<typeof getUserRepositoriesContract.structuredContent> = {
      repositories: repositories.map((repository) => ({
        repositoryId: repository.repositoryId,
        githubRepositoryFullName: repository.githubRepositoryFullName,
        githubOwnerLogin: repository.githubOwnerLogin,
        isSamebaseManaged: repository.isSamebaseManaged,
        sourceSetup:
          repository.sourceSetup.status === "failed"
            ? {
                status: repository.sourceSetup.status,
                message:
                  "Source setup failed. Check this repository in Samebase for recovery steps.",
              }
            : { status: repository.sourceSetup.status },
        providerSetup:
          repository.providerSetup.status === "failed"
            ? {
                status: repository.providerSetup.status,
                provider: repository.providerSetup.provider,
                message: `Provider setup failed. Call ${RETRY_PROVIDER_SETUP_TOOL} to retry it.`,
              }
            : { status: repository.providerSetup.status },
        deletion: { state: repository.deletion.state },
      })),
    };
    return {
      text: `Found ${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}.`,
      structuredContent,
    };
  },
});

export const repositoryGetStatusTool = defineMcpTool({
  contract: getRepositoryStatusContract,
  args: getRepositoryStatusContract.mcpArgs,
  successFields: {
    structuredContent: getRepositoryStatusContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const structuredContent = projectRepositoryStatusForMcp({
      repository,
      status: await readRepositoryStatusForUser(ctx, { userId: args.userId, repository }),
    });
    const { attention, defaultBranch, openPullRequestCount, setupStack, stacks } =
      structuredContent;

    // An empty attention list means only that no setup repair applies: a failed check and an
    // unreadable fact also keep the repository from being healthy.
    const failures: string[] = [];
    if (
      defaultBranch !== null &&
      defaultBranch.checks !== null &&
      defaultBranch.checks.failed > 0
    ) {
      const { failed, failedNames, failedNamesComplete } = defaultBranch.checks;
      failures.push(
        `${failed} ${failed === 1 ? "check" : "checks"} failed on ${defaultBranch.name}${failedNames.length === 0 ? "" : `: ${failedNames.join(", ")}${failedNamesComplete ? "" : ", and others"}`}.`,
      );
    }
    const unreadable = [
      ...(defaultBranch === null ? ["the default branch head"] : []),
      ...(setupStack?.state === "unavailable" ? ["the setup stack status"] : []),
    ];
    const stackCount = stacks.state === "available" ? stacks.stacks.length : 0;
    const stackSummary =
      stacks.state === "available" || stacks.state === "no_store"
        ? `${stackCount} ${stackCount === 1 ? "stack" : "stacks"}`
        : "stacks unreadable";
    const findings = [
      ...(attention.length === 0
        ? []
        : [
            `Needs attention: ${attention.map((item) => (item.tool === null ? item.problem : `${item.problem} Fix: ${item.tool}.`)).join(" ")}`,
          ]),
      ...failures,
      ...(unreadable.length === 0 ? [] : [`Could not read ${unreadable.join(", ")}.`]),
    ];
    return {
      text: `${structuredContent.repository}: ${stackSummary}, ${openPullRequestCount === null ? "pull requests unavailable" : `${openPullRequestCount} open ${openPullRequestCount === 1 ? "pull request" : "pull requests"}`}. ${findings.length === 0 ? "Nothing needs attention." : findings.join(" ")}`,
      structuredContent,
    };
  },
});

export const repositoryCreateTool = defineMcpTool({
  contract: createRepositoryContract,
  args: createRepositoryContract.mcpArgs,
  successFields: {
    structuredContent: createRepositoryContract.structuredContent,
  },
  run: async (ctx, args) => {
    const githubAccess = await resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "owner", githubOwnerLogin: args.githubOwnerLogin },
    });
    const result = await createAppForUser(ctx, {
      userId: args.userId,
      target: { kind: "organization", organizationId: githubAccess.organizationId },
      githubRepositoryName: args.name,
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.private !== undefined ? { private: args.private } : {}),
    });
    const structuredContent: Infer<typeof createRepositoryContract.structuredContent> = {
      repositoryId: result.repositoryId,
      githubRepositoryFullName: `${githubAccess.githubOwnerLogin}/${toSafeGitHubRepositoryName(args.name)}`,
    };
    return {
      text: `Started setup of ${structuredContent.githubRepositoryFullName} by its GitHub Actions. Samebase writes the Actions secret and variable and seeds the starter; then the repository's GitHub Actions run Alchemy, create the Convex project, and deploy the app to Convex. Poll repository_list until provider setup is ready or failed. Ready does not mean deployed: the deployment runs in GitHub Actions, and repository_getStatus reports when it finished.`,
      structuredContent,
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
    const result = await connectRepositoryByFullNameForUser(ctx, args);
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

export const repositoryRetryProviderSetupTool = defineMcpTool({
  contract: retryInfrastructureProvisioningContract,
  args: { ...retryInfrastructureProvisioningContract.mcpArgs, ...mcpGrantArgs },
  successFields: {
    structuredContent: retryInfrastructureProvisioningContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const confirmationRequest = await retryProviderSetupForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      surface: mcpConfirmationSurface(args),
      confirmation: args.confirmation,
    });
    if (confirmationRequest) {
      return requestMcpConfirmation(RETRY_PROVIDER_SETUP_TOOL, confirmationRequest);
    }
    return {
      text: `Started a provider setup run for ${repository.githubRepositoryFullName}. Poll repository_list for progress.`,
      structuredContent: { state: "setup_started" as const },
    };
  },
});
