"use node";

import { type Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import { discoverCloudflareWorkersForRepository } from "../cloudflareResources";
import {
  listConvexManagementProjects,
  requestConvexManagementApi,
} from "../convexManagementApi/client";
import type { ProjectResponse } from "../convexManagementApi/types.generated";
import { action } from "../functions";
import {
  fetchGitHubConvexConfigDiscovery,
  type GitHubConvexConfigDiscovery,
} from "../githubRepoApi";
import { toErrorMessage } from "../jsonUtils";
import { validateAppResourceName } from "../../shared/appResourceNames";
import { normalizeConvexConfigPath } from "../../shared/convexConfigPath";
import {
  convexAttachProjectsContract,
  convexChangeProjectConfigPathContract,
  convexCreateProjectContract,
  convexDetachProjectContract,
  convexDiscoverProjectsContract,
  convexReconcileProjectTeamContract,
  vConvexAttachmentProject,
} from "./contracts/convexAttachments";

const { id } = v;

type ConvexAttachmentProject = Infer<typeof vConvexAttachmentProject>;
type ConvexActionConnection = {
  token: string;
  teamId: string;
};
type ProviderAttachmentVaultContext = {
  ghRepoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
};
type ConvexWorkerReference = ConvexAttachmentProject["workerReferences"][number];

async function resolveConvexConnection(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<ConvexActionConnection> {
  const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "convex",
  });
  const token = connection?.kind === "convex" ? connection.auth.credential.trim() : "";
  const teamId = connection?.kind === "convex" ? connection.teamId.trim() : "";
  if (!token || !teamId) {
    throw new Error("Convex connection is required.");
  }
  return { token, teamId };
}

async function resolveGitHubAccessToken(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<string> {
  const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  const token = connection?.kind === "github" ? connection.auth.credential.trim() : "";
  if (!token) {
    throw new Error("GitHub connection is required.");
  }
  return token;
}

async function readProviderAttachmentVaultContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<ProviderAttachmentVaultContext> {
  return await ctx.runQuery(
    internal.vault.providerObservationQueries.readProviderAttachmentVaultContext,
    args,
  );
}

async function discoverConvexConfigs(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<{
  context: ProviderAttachmentVaultContext;
  source: GitHubConvexConfigDiscovery;
}> {
  const [context, githubAccessToken] = await Promise.all([
    readProviderAttachmentVaultContext(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    }),
    resolveGitHubAccessToken(ctx, args.userId),
  ]);
  const source = await fetchGitHubConvexConfigDiscovery({
    githubAccessToken,
    owner: context.owner,
    repo: context.name,
    expectedRepoId: context.ghRepoId,
  });
  return { context, source };
}

function requireVerifiedConvexConfig(
  source: GitHubConvexConfigDiscovery,
  args: { convexConfigPath: string; blobSha: string },
): void {
  const convexConfigPath = normalizeConvexConfigPath(args.convexConfigPath);
  const blobSha = args.blobSha.trim();
  const candidate = source.configs.find(
    (config) => config.convexConfigPath === convexConfigPath && config.blobSha === blobSha,
  );
  if (!candidate || candidate.state !== "valid") {
    throw new Error(
      `GitHub no longer has the selected valid Convex config at ${convexConfigPath}. Scan the repository again.`,
    );
  }
}

function compareConvexAttachmentProject(
  left: ConvexAttachmentProject,
  right: ConvexAttachmentProject,
): number {
  return (
    left.projectName.localeCompare(right.projectName) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.projectId.localeCompare(right.projectId)
  );
}

function toConvexAttachmentProject(
  project: ProjectResponse,
  workerReferences: ConvexWorkerReference[],
): ConvexAttachmentProject {
  return {
    teamId: project.teamId,
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    teamSlug: project.teamSlug,
    workerReferences,
  };
}

async function listProjectsForConnection(
  connection: ConvexActionConnection,
): Promise<ProjectResponse[]> {
  return await listConvexManagementProjects({
    token: connection.token,
    teamId: connection.teamId,
  });
}

async function readConvexProject(args: {
  connection: ConvexActionConnection;
  projectId: string;
}): Promise<ProjectResponse> {
  const project = await requestConvexManagementApi(
    args.connection.token,
    "GET",
    "/projects/{project_id}",
    { params: { path: { project_id: args.projectId } } },
  );
  if (project.id !== args.projectId || project.teamId !== args.connection.teamId) {
    throw new Error("Convex project is not available under the connected team.");
  }
  return project;
}

async function recordConvexTeamSlug(
  ctx: Pick<ActionCtx, "runMutation">,
  args: { userId: Id<"users">; connection: ConvexActionConnection; project: ProjectResponse },
): Promise<void> {
  await ctx.runMutation(internal.providerConnections.setConvexTeamSlug, {
    userId: args.userId,
    teamId: args.connection.teamId,
    teamSlug: args.project.teamSlug,
  });
}

async function readConvexWorkerReferences(
  ctx: Pick<ActionCtx, "runAction">,
  args: {
    userId: Id<"users">;
    context: ProviderAttachmentVaultContext;
    defaultBranch: string;
  },
): Promise<Map<string, ConvexWorkerReference[]>> {
  try {
    const connection = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
      userId: args.userId,
    });
    const token = connection?.auth.credential.trim();
    if (!connection || !token || connection.defaultAccount.state !== "selected") {
      return new Map();
    }
    const accountId = connection.defaultAccount.accountId;
    const discovery = await discoverCloudflareWorkersForRepository({
      token,
      transport: resolveCloudflareApiTransport(connection.auth.method),
      accountId,
      expectedRepoId: args.context.ghRepoId,
      defaultBranch: args.defaultBranch,
    });
    const references = new Map<string, ConvexWorkerReference[]>();
    for (const worker of discovery.workers) {
      if (
        worker.repository.state !== "ready" ||
        (worker.convexBuildAccess.state !== "configured" &&
          worker.convexBuildAccess.state !== "incomplete")
      ) {
        continue;
      }
      const projectReferences = references.get(worker.convexBuildAccess.convexProject.projectId);
      const reference = {
        accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        rootDirectory: worker.repository.rootDirectory,
        markerTeamId: worker.convexBuildAccess.convexProject.teamId,
        access: worker.convexBuildAccess.state,
      };
      if (projectReferences) {
        projectReferences.push(reference);
      } else {
        references.set(worker.convexBuildAccess.convexProject.projectId, [reference]);
      }
    }
    for (const projectReferences of references.values()) {
      projectReferences.sort(
        (left, right) =>
          left.rootDirectory.localeCompare(right.rootDirectory) ||
          left.workerName.localeCompare(right.workerName) ||
          left.workerTag.localeCompare(right.workerTag),
      );
    }
    return references;
  } catch {
    return new Map();
  }
}

export async function discoverProjectsForUser(
  ctx: ActionCtx,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
) {
  const [sourceDiscovery, connection] = await Promise.all([
    discoverConvexConfigs(ctx, args),
    resolveConvexConnection(ctx, args.userId),
  ]);
  const [providerProjects, workerReferences] = await Promise.all([
    listProjectsForConnection(connection),
    readConvexWorkerReferences(ctx, {
      userId: args.userId,
      context: sourceDiscovery.context,
      defaultBranch: sourceDiscovery.source.defaultBranch,
    }),
  ]);
  const projects = providerProjects
    .map((project) => toConvexAttachmentProject(project, workerReferences.get(project.id) ?? []))
    .sort(compareConvexAttachmentProject);
  return { source: sourceDiscovery.source, projects };
}

export async function attachExistingProjectsForUser(
  ctx: ActionCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    projects: Array<{ projectId: string; convexConfigPath: string; blobSha: string }>;
  },
): Promise<Array<Id<"vaultConvexProjects">>> {
  if (args.projects.length === 0) {
    throw new Error("Select at least one Convex project.");
  }
  const normalizedProjects = args.projects.map((project) => ({
    projectId: project.projectId.trim(),
    convexConfigPath: normalizeConvexConfigPath(project.convexConfigPath),
    blobSha: project.blobSha.trim(),
  }));
  if (
    normalizedProjects.some((project) => !project.projectId) ||
    new Set(normalizedProjects.map((project) => project.projectId)).size !==
      normalizedProjects.length
  ) {
    throw new Error("Each selected Convex project must have one unique project id.");
  }

  const [sourceDiscovery, connection] = await Promise.all([
    discoverConvexConfigs(ctx, args),
    resolveConvexConnection(ctx, args.userId),
  ]);
  for (const project of normalizedProjects) {
    const source = sourceDiscovery.source.configs.find(
      (config) =>
        config.state === "valid" &&
        config.convexConfigPath === project.convexConfigPath &&
        config.blobSha === project.blobSha,
    );
    if (!source) {
      throw new Error(
        `GitHub no longer has the selected valid Convex config at ${project.convexConfigPath}. Scan the repository again.`,
      );
    }
  }
  const providerProjects = await Promise.all(
    normalizedProjects.map(
      async (project) => await readConvexProject({ connection, projectId: project.projectId }),
    ),
  );
  await Promise.all(
    providerProjects.map(
      async (project) =>
        await recordConvexTeamSlug(ctx, { userId: args.userId, connection, project }),
    ),
  );
  return await ctx.runMutation(internal.vault.convexMutations.attachProjects, {
    vaultId: args.vaultId,
    userId: args.userId,
    projects: normalizedProjects.map((project) => ({
      teamId: connection.teamId,
      projectId: project.projectId,
      convexConfigPath: project.convexConfigPath,
      origin: "selected_existing" as const,
    })),
  });
}

async function createProjectForUser(
  ctx: ActionCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    projectName: string;
    convexConfigPath: string;
    blobSha: string;
  },
): Promise<Id<"vaultConvexProjects">> {
  const validation = validateAppResourceName(args.projectName, "convex");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const convexConfigPath = normalizeConvexConfigPath(args.convexConfigPath);
  const [sourceDiscovery, connection] = await Promise.all([
    discoverConvexConfigs(ctx, args),
    resolveConvexConnection(ctx, args.userId),
  ]);
  requireVerifiedConvexConfig(sourceDiscovery.source, {
    convexConfigPath,
    blobSha: args.blobSha,
  });
  const projects = await listProjectsForConnection(connection);
  if (
    projects.some(
      (project) => project.name === validation.value || project.slug === validation.value,
    )
  ) {
    throw new Error(
      `Convex project name ${validation.value} already exists. Attach that project or choose another name.`,
    );
  }

  const created = await requestConvexManagementApi(
    connection.token,
    "POST",
    "/teams/{team_id}/create_project",
    {
      params: { path: { team_id: connection.teamId } },
      body: { projectName: validation.value, deploymentType: "prod" },
    },
  );
  let convexProjectId: Id<"vaultConvexProjects">;
  try {
    const [attachedProjectId] = await ctx.runMutation(
      internal.vault.convexMutations.attachProjects,
      {
        vaultId: args.vaultId,
        userId: args.userId,
        projects: [
          {
            teamId: connection.teamId,
            projectId: created.id,
            convexConfigPath,
            origin: "provisioned",
          },
        ],
      },
    );
    if (!attachedProjectId) {
      throw new Error("Convex project attachment was not recorded.");
    }
    convexProjectId = attachedProjectId;
  } catch (error) {
    throw new Error(
      `Convex created project ${validation.value}, but Samebase could not attach it. Inspect Convex before retrying. Reason: ${toErrorMessage(error)}`,
    );
  }

  try {
    const project = await readConvexProject({ connection, projectId: created.id });
    await recordConvexTeamSlug(ctx, { userId: args.userId, connection, project });
  } catch (error) {
    console.warn("vault:convex:create_project:metadata_refresh_failed", {
      vaultId: args.vaultId,
      convexProjectId,
      message: toErrorMessage(error),
    });
  }
  return convexProjectId;
}

async function createProjectForManagedWorkflow(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    convexConfigPath: string;
    projectName: string;
  },
): Promise<Id<"vaultConvexProjects">> {
  const validation = validateAppResourceName(args.projectName, "convex");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const connection = await resolveConvexConnection(ctx, args.userId);
  const checkpoint = await ctx.runQuery(
    internal.vault.convexMutations.readManagedProjectCreateCheckpoint,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      projectName: validation.value,
      teamId: connection.teamId,
    },
  );
  let projectId: string;
  if (checkpoint.state === "created") {
    projectId = checkpoint.projectId;
  } else {
    const projects = await listProjectsForConnection(connection);
    if (
      projects.some(
        (project) => project.name === validation.value || project.slug === validation.value,
      )
    ) {
      if (checkpoint.state === "creating") {
        throw new Error(
          `Convex project ${validation.value} exists after an interrupted create. Delete it in the Convex dashboard, then retry.`,
        );
      }
      throw new Error(
        `Convex project name ${validation.value} already exists. Choose another project name and try again.`,
      );
    }
    if (checkpoint.state === "planned") {
      await ctx.runMutation(internal.vault.convexMutations.beginManagedProjectCreate, {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        projectName: validation.value,
        teamId: connection.teamId,
      });
    }
    const created = await requestConvexManagementApi(
      connection.token,
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: connection.teamId } },
        body: { projectName: validation.value, deploymentType: "prod" },
      },
    );
    projectId = created.id;
  }

  const project = await readConvexProject({ connection, projectId });
  await recordConvexTeamSlug(ctx, { userId: args.userId, connection, project });
  return await ctx.runMutation(internal.vault.convexMutations.recordManagedProjectCreated, {
    vaultId: args.vaultId,
    runId: args.runId,
    userId: args.userId,
    convexConfigPath: args.convexConfigPath,
    projectName: validation.value,
    teamId: connection.teamId,
    projectId,
  });
}

export const discoverProjects = action({
  access: convexDiscoverProjectsContract.access,
  args: convexDiscoverProjectsContract.args,
  returns: convexDiscoverProjectsContract.returns,
  mcp: convexDiscoverProjectsContract.mcp,
  handler: async (ctx, args) =>
    await discoverProjectsForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const attachProjects = action({
  access: convexAttachProjectsContract.access,
  args: convexAttachProjectsContract.args,
  returns: convexAttachProjectsContract.returns,
  mcp: convexAttachProjectsContract.mcp,
  handler: async (ctx, args): Promise<Array<Id<"vaultConvexProjects">>> =>
    await attachExistingProjectsForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const createProject = action({
  access: convexCreateProjectContract.access,
  args: convexCreateProjectContract.args,
  returns: convexCreateProjectContract.returns,
  handler: async (ctx, args): Promise<Id<"vaultConvexProjects">> =>
    await createProjectForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const changeProjectConfigPath = action({
  access: convexChangeProjectConfigPathContract.access,
  args: convexChangeProjectConfigPathContract.args,
  returns: convexChangeProjectConfigPathContract.returns,
  handler: async (ctx, args): Promise<null> => {
    const [attachment, sourceDiscovery] = await Promise.all([
      ctx.runQuery(internal.vault.convexMutations.readProjectAttachmentContext, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
        convexProjectId: args.convexProjectId,
      }),
      discoverConvexConfigs(ctx, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }),
    ]);
    const convexConfigPath = normalizeConvexConfigPath(args.convexConfigPath);
    requireVerifiedConvexConfig(sourceDiscovery.source, {
      convexConfigPath,
      blobSha: args.blobSha,
    });
    await ctx.runMutation(internal.vault.convexMutations.reconcileProjectConvexConfigPath, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
      convexProjectId: args.convexProjectId,
      projectId: attachment.projectId,
      expectedConvexConfigPath: attachment.convexConfigPath,
      nextConvexConfigPath: convexConfigPath,
    });
    return null;
  },
});

export const reconcileProjectTeam = action({
  access: convexReconcileProjectTeamContract.access,
  args: convexReconcileProjectTeamContract.args,
  returns: convexReconcileProjectTeamContract.returns,
  handler: async (ctx, args): Promise<null> => {
    const [attachment, connection] = await Promise.all([
      ctx.runQuery(internal.vault.convexMutations.readProjectAttachmentContext, {
        ...args,
        userId: ctx.viewer.userId,
      }),
      resolveConvexConnection(ctx, ctx.viewer.userId),
    ]);
    await readConvexProject({ connection, projectId: attachment.projectId });
    await ctx.runMutation(internal.vault.convexMutations.reconcileProjectTeam, {
      ...args,
      userId: ctx.viewer.userId,
      projectId: attachment.projectId,
      expectedTeamId: attachment.teamId,
      nextTeamId: connection.teamId,
    });
    return null;
  },
});

export const detachProject = action({
  access: convexDetachProjectContract.access,
  args: convexDetachProjectContract.args,
  returns: convexDetachProjectContract.returns,
  handler: async (ctx, args): Promise<null> => {
    const attachment = await ctx.runQuery(
      internal.vault.convexMutations.readProjectAttachmentContext,
      { ...args, userId: ctx.viewer.userId },
    );
    await ctx.runMutation(internal.vault.convexMutations.detachProject, {
      ...args,
      userId: ctx.viewer.userId,
      teamId: attachment.teamId,
      projectId: attachment.projectId,
      convexConfigPath: attachment.convexConfigPath,
    });
    return null;
  },
});

/** Used only by the explicit create-app workflow. Manual attachment actions run directly. */
export const ensureConvexProjectConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    convexConfigPath: v.string(),
    projectName: v.string(),
  },
  returns: id("vaultConvexProjects"),
  handler: async (
    ctx,
    { vaultId, runId, userId, convexConfigPath, projectName },
  ): Promise<Id<"vaultConvexProjects">> =>
    await createProjectForManagedWorkflow(ctx, {
      vaultId,
      runId,
      userId,
      convexConfigPath,
      projectName,
    }),
});
