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
import { detachResourceContract } from "../repository/contracts/detachResource";
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
  rotateConvexDeployKeysForWorkersBuildsForUser,
  selectConvexDeployKeyTarget,
  type ConvexDeployKeyOutcome,
} from "../repository/cloudflare";
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
import { defineMcpTool } from "./mcpTool";
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
const ROTATE_CONVEX_DEPLOY_KEYS_TOOL =
  cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name;

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
The Convex project whose deploy key a Worker tool installs. MCP resolves only a given name; the
server rule selectConvexDeployKeyTarget decides the rest, before any provider request. Undefined
means that no Convex project is attached.
*/
async function selectConvexDeployKeyProject(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    userId: Id<"users">;
    repository: UserRepositoryResult;
    convexProjectName: string | undefined;
  },
): Promise<Id<"repositoryConvexProjects"> | undefined> {
  const target = await selectConvexDeployKeyTarget(ctx, {
    userId: args.userId,
    repositoryId: args.repository.repositoryId,
    convexProjectId:
      args.convexProjectName === undefined
        ? undefined
        : await findAttachedConvexProjectByName(ctx, {
            userId: args.userId,
            repository: args.repository,
            projectName: args.convexProjectName,
          }),
  });
  return target.state === "selected" ? target.convexProjectId : undefined;
}

async function findAttachedConvexProjectByName(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { userId: Id<"users">; repository: UserRepositoryResult; projectName: string },
): Promise<Id<"repositoryConvexProjects">> {
  const requestedName = args.projectName.trim();
  const projects = nameAttachedConvexProjects(
    args.repository.convexProjects,
    await readRepositoryConvexTeamProjectNames(ctx, args),
  );
  const project = projects.find(
    (candidate) =>
      candidate.projectName === requestedName || candidate.projectSlug === requestedName,
  );
  if (!project) {
    throw new ConvexError(
      `No attached Convex project of ${args.repository.githubRepositoryFullName} is named ${requestedName}. Attached Convex projects: ${projects.length === 0 ? "none" : formatAttachedConvexProjects(projects)}.`,
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
  args: retryInfrastructureProvisioningContract.mcpArgs,
  successFields: {},
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    await retryProviderSetupForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
    });
    return {
      text: `Started a provider setup run for ${repository.githubRepositoryFullName}. Poll repository_list for progress.`,
    };
  },
});

export const repositoryDetachResourceTool = defineMcpTool({
  contract: detachResourceContract,
  args: detachResourceContract.mcpArgs,
  successFields: {
    structuredContent: detachResourceContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const resourceName = args.resourceName.trim();
    if (args.kind === "cloudflare_worker") {
      const worker = findAttachedWorkerByName(repository, resourceName);
      await ctx.runMutation(internal.repository.detachResourceForUser, {
        userId: args.userId,
        repositoryId: repository.repositoryId,
        resource: { kind: "cloudflare_worker", workerId: worker.workerId },
      });
    } else {
      const convexProjectId = await findAttachedConvexProjectByName(ctx, {
        userId: args.userId,
        repository,
        projectName: resourceName,
      });
      await ctx.runMutation(internal.repository.detachResourceForUser, {
        userId: args.userId,
        repositoryId: repository.repositoryId,
        resource: { kind: "convex_project", convexProjectId },
      });
    }
    return {
      text: `Removed the ${args.kind === "cloudflare_worker" ? "Cloudflare Worker" : "Convex project"} ${resourceName} from ${repository.githubRepositoryFullName} in Samebase. It keeps running in its provider account.`,
      structuredContent: { kind: args.kind, resourceName },
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
  args: cloudflareConnectWorkerContract.mcpArgs,
  successFields: {
    structuredContent: cloudflareConnectWorkerContract.structuredContent,
  },
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const convexProjectId = await selectConvexDeployKeyProject(ctx, {
      userId: args.userId,
      repository,
      convexProjectName: args.convexProjectName,
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
    });
    if (result.state === "added_with_notice") {
      const message = `Samebase attached ${worker.workerName}, but its Workers Builds setup did not complete. ${publicMcpErrorMessage(result.error)} When the cause is fixed, call ${CONFIGURE_BUILDS_TOOL} for this Worker${result.deployKeyPending ? `, then ${ROTATE_CONVEX_DEPLOY_KEYS_TOOL} to install the Convex deploy key` : ""}.`;
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
      args.convexProjectName === undefined && pendingCloudflareSetup
        ? pendingCloudflareSetup.convexProjectId
        : await selectConvexDeployKeyProject(ctx, {
            userId: args.userId,
            repository,
            convexProjectName: args.convexProjectName,
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
  args: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcpArgs,
  successFields: {},
  run: async (ctx, args) => {
    const repository = await readRepositoryForMcp(ctx, args);
    const worker = findAttachedWorkerByName(repository, args.workerName);
    const convexProjectId = await selectConvexDeployKeyProject(ctx, {
      userId: args.userId,
      repository,
      convexProjectName: args.convexProjectName,
    });
    if (convexProjectId === undefined) {
      throw new ConvexError(
        `${repository.githubRepositoryFullName} has no attached Convex project. Attach one with repository_convex_attachProject or create one with repository_convex_createProject first.`,
      );
    }

    await rotateConvexDeployKeysForWorkersBuildsForUser(ctx, {
      userId: args.userId,
      repositoryId: repository.repositoryId,
      workerId: worker.workerId,
      convexProjectId,
    });
    return {
      text: `Replaced the Convex deploy keys for ${worker.workerName} and started a production build. A started build does not prove a successful deployment.`,
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
    const requestedName = args.projectName.trim();
    const teamProjects = await readConvexTeamProjectNamesForUser(ctx, {
      userId: args.userId,
      organizationId: repository.organizationId,
      teamId: repository.convexTeamId,
    });
    const projectId = [...teamProjects].find(
      ([, names]) => names.projectName === requestedName || names.projectSlug === requestedName,
    )?.[0];
    if (projectId === undefined) {
      throw new ConvexError(
        `The repository's Convex team has no project named ${requestedName}. Call repository_convex_findProjects to see attachable projects, or create one with repository_convex_createProject.`,
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
          ? `Convex project ${requestedName} is already attached to ${repository.githubRepositoryFullName}.`
          : `Convex project ${requestedName} is attached to another Samebase repository, so it cannot be attached here.`,
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
      text: `Attached Convex project ${requestedName} to ${repository.githubRepositoryFullName} at ${codeLocationPath}.`,
      structuredContent: { projectName: requestedName, codeLocation: codeLocationPath },
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
