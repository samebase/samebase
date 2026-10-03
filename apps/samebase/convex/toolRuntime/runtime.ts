"use node";

import { ConvexError, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { createRepositoryContract } from "../repository/contracts/createRepository";
import {
  getUserRepositoriesContract,
  type UserRepositoryResult,
} from "../repository/contracts/getUserRepositories";
import { connectRepositoryContract } from "../repository/contracts/connectRepository";
import {
  cloudflareAttachWorkersContract,
  cloudflareConnectWorkerContract,
  cloudflareCreateWorkerContract,
  cloudflareDiscoverWorkersContract,
} from "../repository/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexCreateProjectContract,
  convexDiscoverProjectsContract,
  type vGitHubConvexCodeLocationCandidate,
} from "../repository/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../repository/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../repository/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../repository/contracts/retryInfrastructureProvisioning";
import {
  detachResourceContract,
  type DetachableResource,
} from "../repository/contracts/detachResource";
import { getRepositoryStatusContract } from "../repository/contracts/getRepositoryStatus";
import { projectRepositoryStatusForMcp } from "../repository/repositoryStatus";
import { readRepositoryStatusForUser } from "../repository/status";
import { retryProviderSetupForUser } from "../repository";
import { connectRepositoryByFullNameForUser, createAppForUser } from "../repository/actions";
import {
  attachExistingProjectsForUser,
  createProjectForUser,
  discoverConvexCodeLocations,
  discoverProjectsForUser,
  formatAttachedConvexProjects,
  nameAttachedConvexProjects,
  readConvexTeamProjectNamesForUser,
  readRepositoryConvexTeamProjectNames,
} from "../repository/convex";
import {
  attachExistingCloudflareWorkersForUser,
  configureWorkersBuildsForGitHubForUser,
  connectWorkerForUser,
  createWorkerForUser,
  discoverCloudflareWorkersForUser,
  readCloudflareWorkerTagsByNameForUser,
  rotateConvexDeployKeysWithConfirmation,
  selectConvexDeployKeyTarget,
  type ConvexDeployKeyOutcome,
} from "../repository/cloudflare";
import type { ConfirmationSurface } from "../repository/confirmationModel";
import type {
  ActionConfirmation,
  ActionConfirmationRequest,
} from "../repository/contracts/actionConfirmation";
import { publicMcpErrorMessage } from "../mcp/publicErrors";
import { listWorkersBuildTokensForUser } from "../cloudflareBuildTokens";
import type { OrganizationProviderConfiguration } from "../organizationProviderCredentials";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import {
  buildDefaultAppResourceName,
  validateAppResourceName,
} from "../../shared/appResourceNames";
import { getConvexCodeLocationPath } from "../../shared/convexCodeLocation";
import { resolveDefaultConvexDeploymentRegion } from "../../shared/convexDeploymentRegions";
import { toSafeGitHubRepositoryName } from "../../shared/githubRepositoryName";
import { normalizeRepositoryRootDirectory } from "../../shared/repositoryRootDirectory";
import { defineMcpTool, mcpGrantArgs } from "./mcpTool";
import {
  CLOUDFLARE_SETUP_GUIDE_URL,
  findAttachedWorkerByName,
  findRepositoryByReference,
  projectConvexDiscoveryForMcp,
  projectWorkerDiscoveryForMcp,
  readPendingCloudflareSetup,
  requireSelectedWorkersBuildsToken,
  selectConvexCodeLocation,
  selectWorkersBuildsToken,
} from "./mcpResolution";

/*
The MCP side of the tools that the dashboard also calls. Each tool resolves its MCP arguments (a
repository as owner/name, resources by name, an optional token) into the IDs that the shared
handler takes, then runs the same handler that the dashboard function at its tool name runs. The
MCP-only tools live at their own function paths: account.ts and feedback.ts.
*/

type GitHubConvexCodeLocationCandidate = Infer<typeof vGitHubConvexCodeLocationCandidate>;

const CONFIGURE_BUILDS_TOOL = cloudflareConfigureWorkersBuildsForGitHubContract.mcp.name;
const CONNECT_WORKER_TOOL = cloudflareConnectWorkerContract.mcp.name;
const DETACH_RESOURCE_TOOL = detachResourceContract.mcp.name;
const RETRY_PROVIDER_SETUP_TOOL = retryInfrastructureProvisioningContract.mcp.name;
const ROTATE_CONVEX_DEPLOY_KEYS_TOOL =
  cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name;

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

/**
The Convex project whose deploy key a Worker tool installs. MCP resolves only a given slug; the
server rule selectConvexDeployKeyTarget decides the rest, before any provider request. Undefined
means that no Convex project is attached.
*/
async function selectConvexDeployKeyProject(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    repository: UserRepositoryResult;
    convexProjectSlug: string | undefined;
  },
): Promise<Id<"repositoryConvexProjects"> | undefined> {
  const target = await selectConvexDeployKeyTarget(ctx, {
    userId: args.userId,
    repositoryId: args.repository.repositoryId,
    convexProjectId:
      args.convexProjectSlug === undefined
        ? undefined
        : await findAttachedConvexProjectBySlug(ctx, {
            userId: args.userId,
            repository: args.repository,
            projectSlug: args.convexProjectSlug,
          }),
  });
  return target.state === "selected" ? target.convexProjectId : undefined;
}

/**
MCP names an attached Convex project by its slug only: the slug is unique inside a Convex team, while
two projects can share a display name, and one project's name can be another project's slug.
*/
async function findAttachedConvexProjectBySlug(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { userId: Id<"users">; repository: UserRepositoryResult; projectSlug: string },
): Promise<Id<"repositoryConvexProjects">> {
  const requestedSlug = args.projectSlug.trim();
  const projects = nameAttachedConvexProjects(
    args.repository.convexProjects,
    await readRepositoryConvexTeamProjectNames(ctx, args),
  );
  const project = projects.find((candidate) => candidate.projectSlug === requestedSlug);
  if (!project) {
    throw new ConvexError(
      `No attached Convex project of ${args.repository.githubRepositoryFullName} has the slug ${requestedSlug}. Attached Convex project slugs: ${projects.length === 0 ? "none" : formatAttachedConvexProjects(projects)}.`,
    );
  }
  return project.convexProjectId;
}

async function selectWorkersBuildsTokenForRepository(
  ctx: Pick<ActionCtx, "runAction">,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    buildTokenUuid: string | undefined;
  },
) {
  return selectWorkersBuildsToken(
    await listWorkersBuildTokensForUser(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
    }),
    args.buildTokenUuid,
  );
}

function projectConvexDeployKeyForMcp(outcome: ConvexDeployKeyOutcome) {
  switch (outcome.state) {
    case "installed":
      return { state: "installed" as const };
    case "no_convex_project":
      return {
        state: "not_installed" as const,
        message: `No Convex project is attached to this repository, so no deploy key was installed. After you attach or create one, call ${ROTATE_CONVEX_DEPLOY_KEYS_TOOL} for this Worker.`,
      };
    case "failed":
      return {
        state: "not_installed" as const,
        message: `Samebase did not install the Convex deploy key, so no production build started. ${publicMcpErrorMessage(outcome.error)} When the cause is fixed, call ${ROTATE_CONVEX_DEPLOY_KEYS_TOOL} for this Worker to install the key and start the build.`,
      };
    default:
      outcome satisfies never;
      throw new Error("Unsupported Convex deploy key outcome.");
  }
}

function describeConvexDeployKey(installation: ReturnType<typeof projectConvexDeployKeyForMcp>) {
  return installation.state === "installed"
    ? "Installed the Convex deploy key and started the production build."
    : installation.message;
}

/** The fixed MCP next step of a connected Worker whose Builds setup did not complete. */
function describeConnectWorkerNextStep(notice: {
  nextStep: "configure_builds" | "start_build" | "review_in_cloudflare";
  deployKeyPending: boolean;
}): string {
  switch (notice.nextStep) {
    case "configure_builds":
      return `When the cause is fixed, call ${CONFIGURE_BUILDS_TOOL} for this Worker${notice.deployKeyPending ? `, then ${ROTATE_CONVEX_DEPLOY_KEYS_TOOL} to install the Convex deploy key` : ""}.`;
    case "start_build":
      return notice.deployKeyPending
        ? `Its Workers Builds settings are connected. Call ${ROTATE_CONVEX_DEPLOY_KEYS_TOOL} for this Worker to install the Convex deploy key and start the production build.`
        : "Its Workers Builds settings are connected. Start a production build in Cloudflare if none is running.";
    case "review_in_cloudflare":
      return `Its Workers Builds settings could not be verified, or they build another root directory or repository. Ask the user to review them in Cloudflare, then call ${getRepositoryStatusContract.mcp.name}.`;
    default:
      notice.nextStep satisfies never;
      throw new Error("Unsupported Worker connection next step.");
  }
}

function toConvexCodeLocationSelection(location: GitHubConvexCodeLocationCandidate) {
  return location.kind === "config"
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
      };
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
    // Repositories on one Convex team share one project list, so each team is read once.
    const teamProjectNameReads = new Map<
      string,
      ReturnType<typeof readRepositoryConvexTeamProjectNames>
    >();
    const convexProjectNames = await Promise.all(
      repositories.map(async (repository) => {
        if (repository.convexProjects.length === 0) {
          return [];
        }
        const teamKey = `${repository.organizationId}/${repository.convexTeamId}`;
        const teamProjectNames =
          teamProjectNameReads.get(teamKey) ??
          readRepositoryConvexTeamProjectNames(ctx, { userId: args.userId, repository });
        teamProjectNameReads.set(teamKey, teamProjectNames);
        return nameAttachedConvexProjects(repository.convexProjects, await teamProjectNames);
      }),
    );
    const structuredContent: Infer<typeof getUserRepositoriesContract.structuredContent> = {
      repositories: repositories.map((repository, index) => {
        const pendingCloudflareSetup = readPendingCloudflareSetup(repository);
        return {
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
                  message:
                    "Provider setup failed. Check this repository in Samebase before retrying.",
                }
              : { status: repository.providerSetup.status },
          pendingCloudflareSetup: pendingCloudflareSetup && {
            workerName: pendingCloudflareSetup.workerName,
            rootDirectory: pendingCloudflareSetup.rootDirectory,
          },
          deletion: { state: repository.deletion.state },
          cloudflareWorkers: repository.cloudflareWorkers.map((worker) => ({
            workerName: worker.workerName,
            rootDirectory: worker.rootDirectory,
          })),
          convexProjects: (convexProjectNames[index] ?? []).map((project) => ({
            projectSlug: project.projectSlug,
            projectName: project.projectName,
            codeLocation: project.codeLocation,
          })),
        };
      }),
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
    const { apps, attention, convexProjects, openPullRequestCount } = structuredContent;
    return {
      text: `${structuredContent.repository}: ${apps.length} ${apps.length === 1 ? "app" : "apps"}, ${convexProjects.length} Convex ${convexProjects.length === 1 ? "project" : "projects"}, ${openPullRequestCount === null ? "pull requests unavailable" : `${openPullRequestCount} open ${openPullRequestCount === 1 ? "pull request" : "pull requests"}`}. ${attention.length === 0 ? "Nothing needs attention." : `Needs attention: ${attention.map((item) => (item.tool === null ? item.problem : `${item.problem} Fix: ${item.tool}.`)).join(" ")}`}`,
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
    const buildToken = await selectWorkersBuildsTokenForRepository(ctx, {
      userId: args.userId,
      organizationId: githubAccess.organizationId,
      buildTokenUuid: args.buildTokenUuid,
    });
    const cloudflareWorkerName =
      args.cloudflareWorkerName ??
      buildDefaultAppResourceName({ repositoryName: args.name, provider: "cloudflare" });

    const result = await createAppForUser(ctx, {
      userId: args.userId,
      target: { kind: "organization", organizationId: githubAccess.organizationId },
      githubRepositoryName: args.name,
      convexProjectName:
        args.convexProjectName ??
        buildDefaultAppResourceName({ repositoryName: args.name, provider: "convex" }),
      convexDeploymentRegion: args.convexDeploymentRegion,
      cloudflareWorkerName,
      cloudflareBuildTokenUuid: buildToken.state === "selected" ? buildToken.uuid : null,
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.private !== undefined ? { private: args.private } : {}),
    });
    const plannedWorkerName = validateAppResourceName(cloudflareWorkerName, "cloudflare");
    const structuredContent: Infer<typeof createRepositoryContract.structuredContent> = {
      repositoryId: result.repositoryId,
      githubRepositoryFullName: `${githubAccess.githubOwnerLogin}/${toSafeGitHubRepositoryName(args.name)}`,
      cloudflare:
        buildToken.state === "selected"
          ? {
              state: "planned",
              workerName: plannedWorkerName.valid ? plannedWorkerName.value : cloudflareWorkerName,
            }
          : { state: "pending", setupGuideUrl: CLOUDFLARE_SETUP_GUIDE_URL },
    };
    return {
      text:
        structuredContent.cloudflare.state === "planned"
          ? `Started setup of ${structuredContent.githubRepositoryFullName} with a Convex project and the Cloudflare Worker ${structuredContent.cloudflare.workerName}. Poll repository_list until source and provider setup are ready or failed.`
          : `Started setup of ${structuredContent.githubRepositoryFullName} with a Convex project. Cloudflare setup is pending because the Cloudflare account has no Workers Builds token: give the user ${CLOUDFLARE_SETUP_GUIDE_URL}. Poll repository_list until source and provider setup are ready or failed.`,
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

/**
The annotated return type breaks a type cycle: the detach tool's result would otherwise depend on
`internal`, which includes this module.
*/
async function detachResourceForMcp(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    resource: DetachableResource;
    surface: ConfirmationSurface;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ActionConfirmationRequest | null> {
  return await ctx.runMutation(internal.repository.detachResourceForUser, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    resource: args.resource,
    surface: args.surface,
    confirmation: args.confirmation,
  });
}

export const repositoryDetachResourceTool = defineMcpTool({
  contract: detachResourceContract,
  args: { ...detachResourceContract.mcpArgs, ...mcpGrantArgs },
  successFields: {
    structuredContent: detachResourceContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const resourceName = args.resourceName.trim();
    const resource =
      args.kind === "cloudflare_worker"
        ? {
            kind: "cloudflare_worker" as const,
            workerId: findAttachedWorkerByName(repository, resourceName).workerId,
          }
        : {
            kind: "convex_project" as const,
            convexProjectId: await findAttachedConvexProjectBySlug(ctx, {
              userId: args.userId,
              repository,
              projectSlug: resourceName,
            }),
          };

    const confirmationRequest = await detachResourceForMcp(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      resource,
      surface: mcpConfirmationSurface(args),
      confirmation: args.confirmation,
    });
    if (confirmationRequest) {
      return requestMcpConfirmation(DETACH_RESOURCE_TOOL, confirmationRequest);
    }
    return {
      text: `Removed the ${args.kind === "cloudflare_worker" ? "Cloudflare Worker" : "Convex project"} ${resourceName} from ${repository.githubRepositoryFullName} in Samebase. It keeps running in its provider account.`,
      structuredContent: { state: "detached" as const, kind: args.kind, resourceName },
    };
  },
});

export const cloudflareFindWorkersTool = defineMcpTool({
  contract: cloudflareDiscoverWorkersContract,
  args: cloudflareDiscoverWorkersContract.mcpArgs,
  successFields: {
    structuredContent: cloudflareDiscoverWorkersContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const structuredContent = projectWorkerDiscoveryForMcp(
      await discoverCloudflareWorkersForUser(ctx, {
        userId: args.userId,
        repositoryId: repository.repositoryId,
      }),
    );
    const attachableCount = structuredContent.workers.filter(
      (worker) => worker.attachment === "attachable",
    ).length;
    const { counts } = structuredContent;
    return {
      text: `Found ${attachableCount} attachable and ${structuredContent.workers.length - attachableCount} connectable Workers in a ${structuredContent.inventoryState} inventory. Not listed: ${counts.attached} already attached here, ${counts.attachedElsewhere} used by other Samebase repositories, ${counts.connectedElsewhere} building other GitHub repositories, ${counts.unavailable} unavailable.`,
      structuredContent,
    };
  },
});

export const cloudflareAttachWorkersTool = defineMcpTool({
  contract: cloudflareAttachWorkersContract,
  args: cloudflareAttachWorkersContract.mcpArgs,
  successFields: {
    structuredContent: cloudflareAttachWorkersContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const workers = await readCloudflareWorkerTagsByNameForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workerNames: args.workerNames,
    });
    await attachExistingCloudflareWorkersForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workers,
    });
    const workerNames = workers.map((worker) => worker.workerName);
    return {
      text: `Attached ${workerNames.join(", ")} to ${repository.githubRepositoryFullName}.`,
      structuredContent: { workerNames },
    };
  },
});

export const cloudflareConnectWorkerTool = defineMcpTool({
  contract: cloudflareConnectWorkerContract,
  args: { ...cloudflareConnectWorkerContract.mcpArgs, ...mcpGrantArgs },
  successFields: {
    structuredContent: cloudflareConnectWorkerContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const convexProjectId = await selectConvexDeployKeyProject(ctx, {
      userId: args.userId,
      repository,
      convexProjectSlug: args.convexProjectSlug,
    });
    const buildTokenUuid = requireSelectedWorkersBuildsToken(
      await selectWorkersBuildsTokenForRepository(ctx, {
        userId: args.userId,
        organizationId: repository.organizationId,
        buildTokenUuid: args.buildTokenUuid,
      }),
    );
    // One requested name reads exactly one Worker identity, or the read throws.
    const [worker] = await readCloudflareWorkerTagsByNameForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workerNames: [args.workerName],
    });
    const rootDirectory = normalizeRepositoryRootDirectory(args.rootDirectory ?? "/");

    const result = await connectWorkerForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory,
      buildTokenUuid,
      convexProjectId,
      surface: mcpConfirmationSurface(args),
      confirmation: args.confirmation,
    });
    if (result.state === "needs_confirmation") {
      return requestMcpConfirmation(CONNECT_WORKER_TOOL, result);
    }
    if (result.state === "added_with_notice") {
      const message = `Samebase attached ${worker.workerName}, but its Workers Builds setup reported an error. ${publicMcpErrorMessage(result.error)} ${describeConnectWorkerNextStep(result)}`;
      return {
        text: message,
        structuredContent: {
          state: "connected_with_notice" as const,
          workerName: worker.workerName,
          message,
        },
      };
    }
    const convexDeployKey = projectConvexDeployKeyForMcp(result.convexDeployKey);
    return {
      text: `Connected ${worker.workerName} to ${repository.githubRepositoryFullName} at ${rootDirectory}. ${describeConvexDeployKey(convexDeployKey)}`,
      structuredContent: {
        state: "connected" as const,
        workerName: worker.workerName,
        rootDirectory,
        convexDeployKey,
      },
    };
  },
});

export const cloudflareCreateWorkerTool = defineMcpTool({
  contract: cloudflareCreateWorkerContract,
  args: cloudflareCreateWorkerContract.mcpArgs,
  successFields: {
    structuredContent: cloudflareCreateWorkerContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const pendingCloudflareSetup = readPendingCloudflareSetup(repository);
    const workerName = validateAppResourceName(
      args.workerName ??
        pendingCloudflareSetup?.workerName ??
        buildDefaultAppResourceName({
          repositoryName: repository.githubRepositoryName,
          provider: "cloudflare",
        }),
      "cloudflare",
    );
    if (!workerName.valid) {
      throw new ConvexError(workerName.message);
    }
    const rootDirectory = normalizeRepositoryRootDirectory(
      args.rootDirectory ?? pendingCloudflareSetup?.rootDirectory ?? "/",
    );
    const convexProjectId =
      args.convexProjectSlug === undefined && pendingCloudflareSetup
        ? pendingCloudflareSetup.convexProjectId
        : await selectConvexDeployKeyProject(ctx, {
            userId: args.userId,
            repository,
            convexProjectSlug: args.convexProjectSlug,
          });
    const buildTokenUuid = requireSelectedWorkersBuildsToken(
      await selectWorkersBuildsTokenForRepository(ctx, {
        userId: args.userId,
        organizationId: repository.organizationId,
        buildTokenUuid: args.buildTokenUuid,
      }),
    );

    const result = await createWorkerForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workerName: workerName.value,
      rootDirectory,
      buildTokenUuid,
      convexProjectId,
    });
    const convexDeployKey = projectConvexDeployKeyForMcp(result.convexDeployKey);
    return {
      text: `Created ${workerName.value} for ${repository.githubRepositoryFullName} at ${rootDirectory}. ${describeConvexDeployKey(convexDeployKey)}`,
      structuredContent: {
        workerName: workerName.value,
        rootDirectory,
        convexDeployKey,
      },
    };
  },
});

export const cloudflareConfigureBuildsTool = defineMcpTool({
  contract: cloudflareConfigureWorkersBuildsForGitHubContract,
  args: cloudflareConfigureWorkersBuildsForGitHubContract.mcpArgs,
  successFields: {},
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const worker = findAttachedWorkerByName(repository, args.workerName);
    if (
      args.rootDirectory !== undefined &&
      normalizeRepositoryRootDirectory(args.rootDirectory) !== worker.rootDirectory
    ) {
      throw new ConvexError(
        `Worker ${worker.workerName} is recorded at root directory ${worker.rootDirectory}. Omit rootDirectory, or change the recorded root in the Samebase dashboard.`,
      );
    }
    const buildTokenUuid = requireSelectedWorkersBuildsToken(
      await selectWorkersBuildsTokenForRepository(ctx, {
        userId: args.userId,
        organizationId: repository.organizationId,
        buildTokenUuid: args.buildTokenUuid,
      }),
    );

    await configureWorkersBuildsForGitHubForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workerId: worker.workerId,
      rootDirectory: worker.rootDirectory,
      buildTokenUuid,
    });
    return {
      text: `Configured Workers Builds for ${worker.workerName} at ${worker.rootDirectory} and requested a production build. A requested build does not prove a successful deployment.`,
    };
  },
});

export const cloudflareRotateConvexDeployKeysTool = defineMcpTool({
  contract: cloudflareRotateConvexDeployKeysForWorkersBuildsContract,
  args: { ...cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcpArgs, ...mcpGrantArgs },
  successFields: {
    structuredContent: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const worker = findAttachedWorkerByName(repository, args.workerName);
    const convexProjectId = await selectConvexDeployKeyProject(ctx, {
      userId: args.userId,
      repository,
      convexProjectSlug: args.convexProjectSlug,
    });
    if (convexProjectId === undefined) {
      throw new ConvexError(
        `${repository.githubRepositoryFullName} has no attached Convex project. Attach one with repository_convex_attachProject or create one with repository_convex_createProject first.`,
      );
    }

    const confirmationRequest = await rotateConvexDeployKeysWithConfirmation(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workerId: worker.workerId,
      convexProjectId,
      surface: mcpConfirmationSurface(args),
      confirmation: args.confirmation,
    });
    if (confirmationRequest) {
      return requestMcpConfirmation(ROTATE_CONVEX_DEPLOY_KEYS_TOOL, confirmationRequest);
    }
    return {
      text: `Replaced the Convex deploy keys for ${worker.workerName} and started a production build. A started build does not prove a successful deployment.`,
      structuredContent: { state: "rotated" as const },
    };
  },
});

export const convexFindProjectsTool = defineMcpTool({
  contract: convexDiscoverProjectsContract,
  args: convexDiscoverProjectsContract.mcpArgs,
  successFields: {
    structuredContent: convexDiscoverProjectsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const structuredContent = projectConvexDiscoveryForMcp(
      await discoverProjectsForUser(ctx, {
        userId: args.userId,
        repositoryId: repository.repositoryId,
      }),
    );
    const { counts } = structuredContent;
    return {
      text: `Found ${structuredContent.projects.length} attachable Convex ${structuredContent.projects.length === 1 ? "project" : "projects"} and ${structuredContent.codeLocations.paths.length} code ${structuredContent.codeLocations.paths.length === 1 ? "location" : "locations"}. Not listed: ${counts.attached} already attached here, ${counts.attachedElsewhere} used by other Samebase repositories.`,
      structuredContent,
    };
  },
});

export const convexAttachProjectTool = defineMcpTool({
  contract: convexAttachProjectsContract,
  args: convexAttachProjectsContract.mcpArgs,
  successFields: {
    structuredContent: convexAttachProjectsContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    if (repository.convexTeamId === undefined) {
      throw new ConvexError(
        "This repository has no Convex team yet. Connect Convex to its organization in Samebase, then retry.",
      );
    }
    const requestedSlug = args.convexProjectSlug.trim();
    const teamProjects = await readConvexTeamProjectNamesForUser(ctx, {
      userId: args.userId,
      organizationId: repository.organizationId,
      teamId: repository.convexTeamId,
    });
    const projectId = [...teamProjects].find(
      ([, names]) => names.projectSlug === requestedSlug,
    )?.[0];
    if (projectId === undefined) {
      throw new ConvexError(
        `The repository's Convex team has no project with the slug ${requestedSlug}. Call repository_convex_findProjects to see the slugs of attachable projects, or create one with repository_convex_createProject.`,
      );
    }
    const recordedAttachment = (
      await ctx.runQuery(
        internal.repository.providerObservationQueries.readConvexProjectRecordedAttachments,
        { repositoryId: repository.repositoryId, userId: args.userId, projectIds: [projectId] },
      )
    ).find((attachment) => attachment.projectId === projectId);
    if (recordedAttachment) {
      throw new ConvexError(
        recordedAttachment.attachment === "attached"
          ? `Convex project ${requestedSlug} is already attached to ${repository.githubRepositoryFullName}.`
          : `Convex project ${requestedSlug} is attached to another Samebase repository, so it cannot be attached here.`,
      );
    }
    const { source } = await discoverConvexCodeLocations(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
    });
    const codeLocation = selectConvexCodeLocation({
      repositoryFullName: repository.githubRepositoryFullName,
      locations: source.locations,
      requestedPath: args.codeLocation,
    });

    await attachExistingProjectsForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      projects: [{ projectId, codeLocation: toConvexCodeLocationSelection(codeLocation) }],
    });
    const codeLocationPath = getConvexCodeLocationPath(codeLocation);
    return {
      text: `Attached Convex project ${requestedSlug} to ${repository.githubRepositoryFullName} at ${codeLocationPath}.`,
      structuredContent: { projectSlug: requestedSlug, codeLocation: codeLocationPath },
    };
  },
});

export const convexCreateProjectTool = defineMcpTool({
  contract: convexCreateProjectContract,
  args: convexCreateProjectContract.mcpArgs,
  successFields: {
    structuredContent: convexCreateProjectContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const projectName = validateAppResourceName(args.projectName, "convex");
    if (!projectName.valid) {
      throw new ConvexError(projectName.message);
    }
    const { source } = await discoverConvexCodeLocations(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
    });
    const providerConfiguration: OrganizationProviderConfiguration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { userId: args.userId, organizationId: repository.organizationId },
    );
    const codeLocation = selectConvexCodeLocation({
      repositoryFullName: repository.githubRepositoryFullName,
      locations: source.locations,
      requestedPath: args.codeLocation,
    });
    const deploymentRegion =
      args.convexDeploymentRegion ??
      resolveDefaultConvexDeploymentRegion(providerConfiguration.defaultConvexDeploymentRegion);

    await createProjectForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      projectName: projectName.value,
      deploymentRegion,
      codeLocation: toConvexCodeLocationSelection(codeLocation),
    });
    const codeLocationPath = getConvexCodeLocationPath(codeLocation);
    return {
      text: `Created Convex project ${projectName.value} in ${deploymentRegion} and attached it to ${repository.githubRepositoryFullName} at ${codeLocationPath}.`,
      structuredContent: {
        projectName: projectName.value,
        codeLocation: codeLocationPath,
        deploymentRegion,
      },
    };
  },
});
