"use node";

import { ConvexError, type Infer, v } from "convex/values";

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
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { resolveConvexProvisioningConnectionForVaultWorkflow } from "../infraProvisioning";
import {
  fetchGitHubConvexCodeLocationDiscovery,
  type GitHubConvexCodeLocationDiscovery,
} from "../githubRepoApi";
import { toErrorMessage } from "../jsonUtils";
import { validateAppResourceName } from "../../shared/appResourceNames";
import {
  getConvexCodeLocationPath,
  normalizeConvexDirectoryPath,
  type ConvexCodeLocation,
} from "../../shared/convexCodeLocation";
import { normalizeConvexConfigPath } from "../../shared/convexConfigPath";
import {
  convexAttachProjectsContract,
  convexChangeProjectCodeLocationContract,
  convexCreateProjectContract,
  convexDetachProjectContract,
  convexDiscoverProjectsContract,
  vConvexAttachmentProject,
  vConvexCodeLocationSelection,
} from "./contracts/convexAttachments";
import {
  attemptManualProviderWriteFailureRecord,
  requireManualProviderActionDeadline,
} from "./infrastructureOperation";

const { id } = v;

type ConvexAttachmentProject = Infer<typeof vConvexAttachmentProject>;
type ConvexCodeLocationSelection = Infer<typeof vConvexCodeLocationSelection>;
type ConvexActionConnection = {
  organizationId: Id<"organizations">;
  auth: { method: "api_key" | "oauth"; credential: string };
  token: string;
  teamId: string;
};
type ProviderAttachmentVaultContext = {
  organizationId: Id<"organizations">;
  convexTeamId: string;
  cloudflareAccountId: string;
  ghRepoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
};
type ConvexWorkerReference = ConvexAttachmentProject["workerReferences"][number];

async function resolveConvexConnectionForTeam(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { userId: Id<"users">; organizationId: Id<"organizations">; teamId: string },
): Promise<ConvexActionConnection> {
  const connection = await ctx.runQuery(
    internal.organizationProviderCredentials.loadConvexForOrganizationTeam,
    {
      userId: args.userId,
      organizationId: args.organizationId,
      teamId: args.teamId,
    },
  );
  const credential = connection?.credential;
  if (!connection || !credential) {
    throw new Error("Convex connection is required for the attached project team.");
  }
  const token = credential.auth.credential.trim();
  if (!token) {
    throw new Error("Convex connection is required for the attached project team.");
  }
  return {
    organizationId: args.organizationId,
    auth: credential.auth,
    token,
    teamId: connection.teamId,
  };
}

async function resolveConvexConnectionForProvisioningRun(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    teamId: string;
  },
): Promise<ConvexActionConnection> {
  const connection = await resolveConvexProvisioningConnectionForVaultWorkflow(ctx, args);
  return {
    organizationId: connection.organizationId,
    auth: { method: connection.convexAuthMethod, credential: connection.convexToken },
    token: connection.convexToken,
    teamId: connection.convexTeamId,
  };
}

async function readProviderAttachmentVaultContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<ProviderAttachmentVaultContext> {
  return await ctx.runQuery(
    internal.vault.providerObservationQueries.readProviderAttachmentVaultContext,
    {
      vaultId: args.vaultId,
      userId: args.userId,
    },
  );
}

async function discoverConvexCodeLocations(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<{
  context: ProviderAttachmentVaultContext;
  source: GitHubConvexCodeLocationDiscovery;
}> {
  const [context, githubAccess] = await Promise.all([
    readProviderAttachmentVaultContext(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    }),
    resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "vault", vaultId: args.vaultId },
    }),
  ]);
  const source = await fetchGitHubConvexCodeLocationDiscovery({
    octokit: githubAccess.octokit,
    owner: context.owner,
    repo: context.name,
    expectedRepoId: context.ghRepoId,
  });
  return { context, source };
}

function normalizeConvexCodeLocationSelection(
  selection: ConvexCodeLocationSelection,
): ConvexCodeLocationSelection {
  switch (selection.kind) {
    case "config":
      return {
        kind: "config",
        convexConfigPath: normalizeConvexConfigPath(selection.convexConfigPath),
        blobSha: selection.blobSha.trim(),
      };
    case "directory":
      return {
        kind: "directory",
        convexDirectoryPath: normalizeConvexDirectoryPath(selection.convexDirectoryPath),
        convexDirectoryTreeSha: selection.convexDirectoryTreeSha.trim(),
        packageJsonBlobSha: selection.packageJsonBlobSha.trim(),
      };
    default:
      selection satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

function removeConvexCodeLocationEvidence(
  selection: ConvexCodeLocationSelection,
): ConvexCodeLocation {
  switch (selection.kind) {
    case "config":
      return { kind: "config", convexConfigPath: selection.convexConfigPath };
    case "directory":
      return { kind: "directory", convexDirectoryPath: selection.convexDirectoryPath };
    default:
      selection satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

function requireVerifiedConvexCodeLocation(
  source: GitHubConvexCodeLocationDiscovery,
  selection: ConvexCodeLocationSelection,
): void {
  const normalized = normalizeConvexCodeLocationSelection(selection);
  const candidate = source.locations.find((location) => {
    switch (normalized.kind) {
      case "config":
        return (
          location.kind === "config" &&
          location.convexConfigPath === normalized.convexConfigPath &&
          location.blobSha === normalized.blobSha
        );
      case "directory":
        return (
          location.kind === "directory" &&
          location.convexDirectoryPath === normalized.convexDirectoryPath &&
          location.convexDirectoryTreeSha === normalized.convexDirectoryTreeSha &&
          location.packageJsonBlobSha === normalized.packageJsonBlobSha
        );
      default:
        normalized satisfies never;
        return false;
    }
  });
  if (!candidate) {
    throw new Error(
      `GitHub no longer has the selected Convex code location at ${getConvexCodeLocationPath(removeConvexCodeLocationEvidence(normalized))}. Scan the repository again.`,
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
  await ctx.runMutation(internal.organizationProviderCredentials.setConvexTeamSlug, {
    userId: args.userId,
    organizationId: args.connection.organizationId,
    expectedAuth: args.connection.auth,
    teamId: args.connection.teamId,
    teamSlug: args.project.teamSlug,
  });
}

async function recordConvexTeamSlugForProvisioningRun(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    connection: ConvexActionConnection;
    project: ProjectResponse;
  },
): Promise<void> {
  await ctx.runMutation(
    internal.organizationProviderCredentials.setConvexTeamSlugForVaultWorkflow,
    {
      authority: {
        kind: "provisioning",
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
      },
      expectedAuth: args.connection.auth,
      teamId: args.connection.teamId,
      teamSlug: args.project.teamSlug,
    },
  );
}

async function readConvexWorkerReferences(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: {
    userId: Id<"users">;
    context: ProviderAttachmentVaultContext;
    defaultBranch: string;
  },
): Promise<Map<string, ConvexWorkerReference[]>> {
  try {
    const connection = await ctx.runAction(
      internal.cloudflareOAuth.resolveConnectionForOrganization,
      {
        userId: args.userId,
        organizationId: args.context.organizationId,
      },
    );
    const token = connection?.auth.credential.trim();
    if (
      !connection ||
      !token ||
      connection.account.accountId !== args.context.cloudflareAccountId
    ) {
      return new Map();
    }
    const accountId = args.context.cloudflareAccountId;
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
  const sourceDiscovery = await discoverConvexCodeLocations(ctx, args);
  const connection = await resolveConvexConnectionForTeam(ctx, {
    userId: args.userId,
    organizationId: sourceDiscovery.context.organizationId,
    teamId: sourceDiscovery.context.convexTeamId,
  });
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
    projects: Array<{ projectId: string; codeLocation: ConvexCodeLocationSelection }>;
  },
): Promise<Array<Id<"vaultConvexProjects">>> {
  if (args.projects.length === 0) {
    throw new Error("Select at least one Convex project.");
  }
  const normalizedProjects = args.projects.map((project) => ({
    projectId: project.projectId.trim(),
    codeLocation: normalizeConvexCodeLocationSelection(project.codeLocation),
  }));
  if (
    normalizedProjects.some((project) => !project.projectId) ||
    new Set(normalizedProjects.map((project) => project.projectId)).size !==
      normalizedProjects.length
  ) {
    throw new Error("Each selected Convex project must have one unique project id.");
  }

  const sourceDiscovery = await discoverConvexCodeLocations(ctx, args);
  const connection = await resolveConvexConnectionForTeam(ctx, {
    userId: args.userId,
    organizationId: sourceDiscovery.context.organizationId,
    teamId: sourceDiscovery.context.convexTeamId,
  });
  for (const project of normalizedProjects) {
    requireVerifiedConvexCodeLocation(sourceDiscovery.source, project.codeLocation);
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
      codeLocation: removeConvexCodeLocationEvidence(project.codeLocation),
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
    codeLocation: ConvexCodeLocationSelection;
  },
): Promise<Id<"vaultConvexProjects">> {
  const validation = validateAppResourceName(args.projectName, "convex");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const codeLocation = normalizeConvexCodeLocationSelection(args.codeLocation);
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.vault.infrastructureOperation.claimManualProviderWrite,
    {
      vaultId: args.vaultId,
      userId: args.userId,
      actionId,
      action: "create_convex_project",
    },
  );
  let providerCreateStarted = false;
  let projectRecorded = false;
  try {
    const sourceDiscovery = await discoverConvexCodeLocations(ctx, args);
    const connection = await resolveConvexConnectionForTeam(ctx, {
      userId: args.userId,
      organizationId: sourceDiscovery.context.organizationId,
      teamId: sourceDiscovery.context.convexTeamId,
    });
    requireVerifiedConvexCodeLocation(sourceDiscovery.source, codeLocation);
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
    await ctx.runQuery(
      internal.billingResourceQuotas.requireBillingResourceCapacityForProviderCreate,
      {
        userId: args.userId,
        organizationId: connection.organizationId,
        kind: "convex_project",
      },
    );
    requireManualProviderActionDeadline(claim.deadlineAt);
    providerCreateStarted = true;
    const created = await requestConvexManagementApi(
      connection.token,
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: connection.teamId } },
        body: { projectName: validation.value, deploymentType: "prod" },
      },
    );
    const convexProjectId = await ctx.runMutation(
      internal.vault.convexMutations.recordManualProjectCreated,
      {
        vaultId: args.vaultId,
        userId: args.userId,
        actionId,
        teamId: connection.teamId,
        projectId: created.id,
        codeLocation: removeConvexCodeLocationEvidence(codeLocation),
      },
    );
    projectRecorded = true;
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
    await ctx.runMutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
      vaultId: args.vaultId,
      actionId,
      result: "succeeded",
    });
    return convexProjectId;
  } catch (error) {
    const reportedError =
      providerCreateStarted && !projectRecorded
        ? new ConvexError(
            `The Convex project ${validation.value} can exist, but Samebase could not attach it. If it exists, delete it in the Convex dashboard, then retry.`,
          )
        : error;
    await attemptManualProviderWriteFailureRecord(ctx, {
      vaultId: args.vaultId,
      actionId,
    });
    throw reportedError;
  }
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
  const context = await ctx.runQuery(
    internal.vault.providerObservationQueries.readProviderAttachmentVaultContextForProvisioningRun,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
    },
  );
  const connection = await resolveConvexConnectionForProvisioningRun(ctx, {
    vaultId: args.vaultId,
    runId: args.runId,
    userId: args.userId,
    teamId: context.convexTeamId,
  });
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
  let projectCreated = false;
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
    await ctx.runQuery(
      internal.billingResourceQuotas.requireBillingResourceCapacityForVaultProvisioning,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        kind: "convex_project",
      },
    );
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
    projectCreated = true;
  }

  const project = await readConvexProject({ connection, projectId });
  await recordConvexTeamSlugForProvisioningRun(ctx, {
    vaultId: args.vaultId,
    runId: args.runId,
    userId: args.userId,
    connection,
    project,
  });
  try {
    return await ctx.runMutation(internal.vault.convexMutations.recordManagedProjectCreated, {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      convexConfigPath: args.convexConfigPath,
      projectName: validation.value,
      teamId: connection.teamId,
      projectId,
    });
  } catch (error) {
    if (
      !projectCreated ||
      !toErrorMessage(error).includes("Convex project attachment limit reached")
    ) {
      throw error;
    }
    throw new Error(
      `Convex project attachment limit reached after project ${validation.value} was created. Delete it in the Convex dashboard, then retry.`,
    );
  }
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

export const changeProjectCodeLocation = action({
  access: convexChangeProjectCodeLocationContract.access,
  args: convexChangeProjectCodeLocationContract.args,
  returns: convexChangeProjectCodeLocationContract.returns,
  handler: async (ctx, args): Promise<null> => {
    const [attachment, sourceDiscovery] = await Promise.all([
      ctx.runQuery(internal.vault.convexMutations.readProjectAttachmentContext, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
        convexProjectId: args.convexProjectId,
      }),
      discoverConvexCodeLocations(ctx, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }),
    ]);
    const codeLocation = normalizeConvexCodeLocationSelection(args.codeLocation);
    requireVerifiedConvexCodeLocation(sourceDiscovery.source, codeLocation);
    await ctx.runMutation(internal.vault.convexMutations.reconcileProjectCodeLocation, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
      convexProjectId: args.convexProjectId,
      projectId: attachment.projectId,
      expectedCodeLocation: attachment.codeLocation,
      nextCodeLocation: removeConvexCodeLocationEvidence(codeLocation),
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
      {
        vaultId: args.vaultId,
        convexProjectId: args.convexProjectId,
        userId: ctx.viewer.userId,
      },
    );
    await ctx.runMutation(internal.vault.convexMutations.detachProject, {
      vaultId: args.vaultId,
      convexProjectId: args.convexProjectId,
      userId: ctx.viewer.userId,
      teamId: attachment.teamId,
      projectId: attachment.projectId,
      codeLocation: attachment.codeLocation,
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
