"use node";

import { notEmpty } from "@samebase/dependent/main";
import { ConvexError, type Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX } from "../billingErrors";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  discoverCloudflareWorkersForRepository,
  readCloudflareWorkerConvexBuildAccess,
} from "../cloudflareResources";
import {
  isConvexCloudDeployment,
  listConvexManagementDefaultProductionDeployments,
  listConvexManagementProjects,
  requestConvexManagementApiOrThrow,
  type ConvexCloudDeployment,
} from "../convexManagementApi/client";
import { ConvexManagementApiError } from "../convexManagementApi/errors";
import type { ProjectResponse } from "../convexManagementApi/types.generated";
import { action } from "../functions";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { resolveConvexProvisioningConnectionForRepositoryWorkflow } from "../infraProvisioning";
import type { ConvexDeploymentRegion } from "../../shared/convexDeploymentRegions";
import {
  fetchGitHubConvexCodeLocationDiscovery,
  type GitHubConvexCodeLocationDiscovery,
} from "../githubRepoApi";
import { toErrorMessage } from "../jsonUtils";
import {
  AppResourceNameConflictError,
  validateAppResourceName,
} from "../../shared/appResourceNames";
import {
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
import type {
  ConvexProjectRecordedAttachment,
  RecordedProviderAttachment,
} from "./providerObservationQueries";

const { id } = v;

type ConvexAttachmentProject = Infer<typeof vConvexAttachmentProject>;
type ConvexCodeLocationSelection = Infer<typeof vConvexCodeLocationSelection>;
type ConvexActionConnection = {
  organizationId: Id<"organizations">;
  auth: { method: "api_key" | "oauth"; credential: string };
  token: string;
  teamId: string;
};
type ProviderAttachmentRepositoryContext = {
  organizationId: Id<"organizations">;
  convexTeamId?: string;
  cloudflareAccountId?: string;
  githubRepositoryDatabaseId: string;
  githubOwnerLogin: string;
  githubRepositoryName: string;
  defaultBranch: string;
};
type ConvexWorkerReference = ConvexAttachmentProject["workerReferences"][number];

function requireConvexTeamId(context: ProviderAttachmentRepositoryContext): string {
  if (context.convexTeamId === undefined) {
    throw new ConvexError("Convex connection is required before adding a project.");
  }
  return context.convexTeamId;
}

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
    throw new ConvexError("Convex connection is required for the attached project team.");
  }
  const token = credential.auth.credential.trim();
  if (!token) {
    throw new ConvexError("Convex connection is required for the attached project team.");
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
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    teamId: string;
  },
): Promise<ConvexActionConnection> {
  const connection = await resolveConvexProvisioningConnectionForRepositoryWorkflow(ctx, args);
  return {
    organizationId: connection.organizationId,
    auth: { method: connection.convexAuthMethod, credential: connection.convexToken },
    token: connection.convexToken,
    teamId: connection.convexTeamId,
  };
}

async function readProviderAttachmentRepositoryContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<ProviderAttachmentRepositoryContext> {
  return await ctx.runQuery(
    internal.repository.providerObservationQueries.readProviderAttachmentRepositoryContext,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
    },
  );
}

async function discoverConvexCodeLocations(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<{
  context: ProviderAttachmentRepositoryContext;
  source: GitHubConvexCodeLocationDiscovery;
}> {
  const [context, githubAccess] = await Promise.all([
    readProviderAttachmentRepositoryContext(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    }),
    resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "repository", repositoryId: args.repositoryId },
    }),
  ]);
  const source = await fetchGitHubConvexCodeLocationDiscovery({
    octokit: githubAccess.octokit,
    owner: context.githubOwnerLogin,
    repo: context.githubRepositoryName,
    expectedRepoId: context.githubRepositoryDatabaseId,
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
    throw new ConvexError(
      "The selected Convex code location changed. Discover code locations again before attaching.",
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
  recordedAttachment: RecordedProviderAttachment | undefined,
  workerReferences: ConvexWorkerReference[],
  productionDeployment: ConvexCloudDeployment | undefined,
): ConvexAttachmentProject {
  return {
    attachment: recordedAttachment ?? "attachable",
    teamId: project.teamId,
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    teamSlug: project.teamSlug,
    productionDeployment: productionDeployment
      ? { state: "available", region: productionDeployment.region }
      : { state: "missing" },
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

async function isConvexProjectNameInUse(
  connection: ConvexActionConnection,
  projectName: string,
): Promise<boolean> {
  const projects = await listProjectsForConnection(connection);
  return projects.some((project) => project.name === projectName || project.slug === projectName);
}

async function createConvexProjectForConnection(args: {
  connection: ConvexActionConnection;
  projectName: string;
  deploymentRegion: ConvexDeploymentRegion;
}) {
  try {
    return await requestConvexManagementApiOrThrow(
      args.connection.token,
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: args.connection.teamId } },
        body: {
          projectName: args.projectName,
          deploymentType: "prod",
          deploymentRegion: args.deploymentRegion,
        },
      },
    );
  } catch (error) {
    if (!(error instanceof ConvexManagementApiError)) {
      throw error;
    }

    let projectNameInUse: boolean;
    try {
      projectNameInUse = await isConvexProjectNameInUse(args.connection, args.projectName);
    } catch {
      throw error;
    }
    if (projectNameInUse) {
      throw new AppResourceNameConflictError({
        provider: "convex",
        name: args.projectName,
      });
    }
    throw error;
  }
}

async function readConvexProject(args: {
  connection: ConvexActionConnection;
  projectId: string;
}): Promise<ProjectResponse> {
  const project = await requestConvexManagementApiOrThrow(
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
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    connection: ConvexActionConnection;
    project: ProjectResponse;
  },
): Promise<void> {
  await ctx.runMutation(
    internal.organizationProviderCredentials.setConvexTeamSlugForRepositoryWorkflow,
    {
      authority: {
        kind: "provisioning",
        repositoryId: args.repositoryId,
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
    context: ProviderAttachmentRepositoryContext;
    defaultBranch: string;
  },
): Promise<Map<string, ConvexWorkerReference[]>> {
  const accountId = args.context.cloudflareAccountId;
  if (accountId === undefined) {
    return new Map();
  }
  try {
    const connection = await ctx.runAction(
      internal.cloudflareOAuth.resolveConnectionForOrganization,
      {
        userId: args.userId,
        organizationId: args.context.organizationId,
      },
    );
    const token = connection?.auth.credential.trim();
    if (!connection || !token || connection.account.accountId !== accountId) {
      return new Map();
    }
    const transport = resolveCloudflareApiTransport(connection.auth.method);
    const discovery = await discoverCloudflareWorkersForRepository({
      token,
      transport,
      accountId,
      expectedRepoId: args.context.githubRepositoryDatabaseId,
      defaultBranch: args.defaultBranch,
    });
    const markedWorkers = await Promise.all(
      discovery.workers.map(async (worker) => {
        if (worker.repository.state !== "ready" || worker.repository.builds.state !== "available") {
          return null;
        }
        const convexBuildAccess = await readCloudflareWorkerConvexBuildAccess({
          token,
          transport,
          accountId,
          workerTag: worker.workerTag,
        }).catch(() => ({ state: "unavailable" as const }));
        if (convexBuildAccess.state !== "configured" && convexBuildAccess.state !== "incomplete") {
          return null;
        }
        return {
          projectId: convexBuildAccess.convexProject.projectId,
          reference: {
            accountId,
            workerName: worker.workerName,
            workerTag: worker.workerTag,
            rootDirectory: worker.repository.rootDirectory,
            markerTeamId: convexBuildAccess.convexProject.teamId,
            access: convexBuildAccess.state,
          },
        };
      }),
    );

    const references = new Map<string, ConvexWorkerReference[]>();
    for (const { projectId, reference } of markedWorkers.filter(notEmpty)) {
      const projectReferences = references.get(projectId);
      if (projectReferences) {
        projectReferences.push(reference);
      } else {
        references.set(projectId, [reference]);
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
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<Infer<typeof convexDiscoverProjectsContract.returns>> {
  const sourceDiscovery = await discoverConvexCodeLocations(ctx, args);
  const connection = await resolveConvexConnectionForTeam(ctx, {
    userId: args.userId,
    organizationId: sourceDiscovery.context.organizationId,
    teamId: requireConvexTeamId(sourceDiscovery.context),
  });
  const [providerProjects, productionDeployments, workerReferences] = await Promise.all([
    listProjectsForConnection(connection),
    listConvexManagementDefaultProductionDeployments({
      token: connection.token,
      teamId: connection.teamId,
    }),
    readConvexWorkerReferences(ctx, {
      userId: args.userId,
      context: sourceDiscovery.context,
      defaultBranch: sourceDiscovery.source.defaultBranch,
    }),
  ]);
  const recordedAttachments: ConvexProjectRecordedAttachment[] = await ctx.runQuery(
    internal.repository.providerObservationQueries.readConvexProjectRecordedAttachments,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
      projectIds: providerProjects.map((project) => project.id),
    },
  );

  const recordedAttachmentByProjectId = new Map(
    recordedAttachments.map((project) => [project.projectId, project.attachment]),
  );
  const productionDeploymentByProjectId = new Map<string, ConvexCloudDeployment>();
  for (const deployment of productionDeployments) {
    if (isConvexCloudDeployment(deployment)) {
      productionDeploymentByProjectId.set(deployment.projectId, deployment);
    }
  }
  const projects = providerProjects
    .map((project) =>
      toConvexAttachmentProject(
        project,
        recordedAttachmentByProjectId.get(project.id),
        workerReferences.get(project.id) ?? [],
        productionDeploymentByProjectId.get(project.id),
      ),
    )
    .sort(compareConvexAttachmentProject);
  return { source: sourceDiscovery.source, projects };
}

export async function attachExistingProjectsForUser(
  ctx: ActionCtx,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    projects: Array<{ projectId: string; codeLocation: ConvexCodeLocationSelection }>;
  },
): Promise<Array<Id<"repositoryConvexProjects">>> {
  if (args.projects.length === 0) {
    throw new ConvexError("Select at least one Convex project.");
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
    throw new ConvexError("Each selected Convex project must have one unique project id.");
  }

  const sourceDiscovery = await discoverConvexCodeLocations(ctx, args);
  const connection = await resolveConvexConnectionForTeam(ctx, {
    userId: args.userId,
    organizationId: sourceDiscovery.context.organizationId,
    teamId: requireConvexTeamId(sourceDiscovery.context),
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
  return await ctx.runMutation(internal.repository.convexMutations.attachProjects, {
    repositoryId: args.repositoryId,
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
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    projectName: string;
    deploymentRegion: ConvexDeploymentRegion;
    codeLocation: ConvexCodeLocationSelection;
  },
): Promise<Id<"repositoryConvexProjects">> {
  const validation = validateAppResourceName(args.projectName, "convex");
  if (!validation.valid) {
    throw new ConvexError(validation.message);
  }
  const codeLocation = normalizeConvexCodeLocationSelection(args.codeLocation);
  const actionId = crypto.randomUUID();
  const claim = await ctx.runMutation(
    internal.repository.infrastructureOperation.claimManualProviderWrite,
    {
      repositoryId: args.repositoryId,
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
      teamId: requireConvexTeamId(sourceDiscovery.context),
    });
    requireVerifiedConvexCodeLocation(sourceDiscovery.source, codeLocation);
    if (await isConvexProjectNameInUse(connection, validation.value)) {
      throw new AppResourceNameConflictError({
        provider: "convex",
        name: validation.value,
      });
    }
    await ctx.runQuery(
      internal.billingResourceQuotas.requireBillingResourceCapacityForProviderCreate,
      {
        userId: args.userId,
        organizationId: connection.organizationId,
      },
    );
    requireManualProviderActionDeadline(claim.deadlineAt);
    providerCreateStarted = true;
    const created = await createConvexProjectForConnection({
      connection,
      projectName: validation.value,
      deploymentRegion: args.deploymentRegion,
    });
    const convexProjectId = await ctx.runMutation(
      internal.repository.convexMutations.recordManualProjectCreated,
      {
        repositoryId: args.repositoryId,
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
      console.warn("repository:convex:create_project:metadata_refresh_failed", {
        repositoryId: args.repositoryId,
        convexProjectId,
        message: toErrorMessage(error),
      });
    }
    await ctx.runMutation(
      internal.repository.infrastructureOperation.finishManualProviderWriteResult,
      {
        repositoryId: args.repositoryId,
        actionId,
        result: "succeeded",
      },
    );
    return convexProjectId;
  } catch (error) {
    const reportedError =
      error instanceof AppResourceNameConflictError
        ? new ConvexError(error.message)
        : providerCreateStarted && !projectRecorded
          ? new ConvexError(
              `The Convex project ${validation.value} can exist, but Samebase could not attach it. If it exists, delete it in the Convex dashboard, then retry.`,
            )
          : error;
    await attemptManualProviderWriteFailureRecord(ctx, {
      repositoryId: args.repositoryId,
      actionId,
    });
    throw reportedError;
  }
}

async function createProjectForManagedWorkflow(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    convexConfigPath: string;
    projectName: string;
  },
): Promise<Id<"repositoryConvexProjects">> {
  const validation = validateAppResourceName(args.projectName, "convex");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const context = await ctx.runQuery(
    internal.repository.providerObservationQueries
      .readProviderAttachmentRepositoryContextForProvisioningRun,
    {
      repositoryId: args.repositoryId,
      runId: args.runId,
      userId: args.userId,
    },
  );
  const connection = await resolveConvexConnectionForProvisioningRun(ctx, {
    repositoryId: args.repositoryId,
    runId: args.runId,
    userId: args.userId,
    teamId: requireConvexTeamId(context),
  });
  const checkpoint = await ctx.runQuery(
    internal.repository.convexMutations.readManagedProjectCreateCheckpoint,
    {
      repositoryId: args.repositoryId,
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
    if (await isConvexProjectNameInUse(connection, validation.value)) {
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
      internal.billingResourceQuotas.requireBillingResourceCapacityForRepositoryProvisioning,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
      },
    );
    if (checkpoint.state === "planned") {
      await ctx.runMutation(internal.repository.convexMutations.beginManagedProjectCreate, {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
        projectName: validation.value,
        teamId: connection.teamId,
      });
    }
    try {
      const created = await createConvexProjectForConnection({
        connection,
        projectName: validation.value,
        deploymentRegion: checkpoint.deploymentRegion,
      });
      projectId = created.id;
      projectCreated = true;
    } catch (error) {
      if (error instanceof AppResourceNameConflictError) {
        throw new Error(
          `Convex project ${validation.value} exists after an interrupted create. Delete it in the Convex dashboard, then retry.`,
        );
      }
      throw error;
    }
  }

  const project = await readConvexProject({ connection, projectId });
  await recordConvexTeamSlugForProvisioningRun(ctx, {
    repositoryId: args.repositoryId,
    runId: args.runId,
    userId: args.userId,
    connection,
    project,
  });
  try {
    return await ctx.runMutation(internal.repository.convexMutations.recordManagedProjectCreated, {
      repositoryId: args.repositoryId,
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
      !toErrorMessage(error).includes(ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX)
    ) {
      throw error;
    }
    throw new Error(
      `${ORGANIZATION_CONNECTION_LIMIT_ERROR_PREFIX} after project ${validation.value} was created. Delete it in the Convex dashboard, then retry.`,
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
  handler: async (ctx, args): Promise<Array<Id<"repositoryConvexProjects">>> =>
    await attachExistingProjectsForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const createProject = action({
  access: convexCreateProjectContract.access,
  args: convexCreateProjectContract.args,
  returns: convexCreateProjectContract.returns,
  handler: async (ctx, args): Promise<Id<"repositoryConvexProjects">> =>
    await createProjectForUser(ctx, { ...args, userId: ctx.viewer.userId }),
});

export const changeProjectCodeLocation = action({
  access: convexChangeProjectCodeLocationContract.access,
  args: convexChangeProjectCodeLocationContract.args,
  returns: convexChangeProjectCodeLocationContract.returns,
  handler: async (ctx, args): Promise<null> => {
    const [attachment, sourceDiscovery] = await Promise.all([
      ctx.runQuery(internal.repository.convexMutations.readProjectAttachmentContext, {
        repositoryId: args.repositoryId,
        userId: ctx.viewer.userId,
        convexProjectId: args.convexProjectId,
      }),
      discoverConvexCodeLocations(ctx, {
        repositoryId: args.repositoryId,
        userId: ctx.viewer.userId,
      }),
    ]);
    const codeLocation = normalizeConvexCodeLocationSelection(args.codeLocation);
    requireVerifiedConvexCodeLocation(sourceDiscovery.source, codeLocation);
    await ctx.runMutation(internal.repository.convexMutations.reconcileProjectCodeLocation, {
      repositoryId: args.repositoryId,
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
      internal.repository.convexMutations.readProjectAttachmentContext,
      {
        repositoryId: args.repositoryId,
        convexProjectId: args.convexProjectId,
        userId: ctx.viewer.userId,
      },
    );
    await ctx.runMutation(internal.repository.convexMutations.detachProject, {
      repositoryId: args.repositoryId,
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
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    convexConfigPath: v.string(),
    projectName: v.string(),
  },
  returns: id("repositoryConvexProjects"),
  handler: async (
    ctx,
    { repositoryId, runId, userId, convexConfigPath, projectName },
  ): Promise<Id<"repositoryConvexProjects">> =>
    await createProjectForManagedWorkflow(ctx, {
      repositoryId,
      runId,
      userId,
      convexConfigPath,
      projectName,
    }),
});
