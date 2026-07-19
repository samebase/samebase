import { Infer, v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../functions";
import {
  isConvexCloudDeployment,
  listConvexManagementProjects,
  requestConvexManagementApi,
  type ConvexCloudDeployment,
} from "../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import type {
  PlatformDeploymentResponse,
  ProjectResponse,
} from "../convexManagementApi/types.generated";
import { toErrorMessage } from "../jsonUtils";
import { validateAppResourceName } from "../../shared/appResourceNames";
import {
  vVaultConvexDeploymentAttachmentIntent,
  vVaultConvexConnectionTarget,
  type VaultConvexDeploymentAttachmentIntent,
  type VaultConvexDeploymentAttachmentSnapshot,
  type VaultConvexConnectionTarget,
  type VaultConvexOrigin,
} from "./model";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";
import { convexListProjectsContract, vConvexProjectResult } from "./contracts/convexListProjects";
import { convexConnectExistingProjectContract } from "./contracts/convexConnectExistingProject";
import { observeConvexDeployment } from "./providerResourceObservations";

const { id, null: nullValue, string } = v;

type ConvexProjectResult = Infer<typeof vConvexProjectResult>;
type ConvexActionConnection = {
  token: string;
  teamId: string;
};
type ConvexInfrastructureRecord = {
  convexProjectId: string;
  convexTeamSlug: string;
  convexProjectSlug: string;
  convexDeploymentName: string;
  convexDeploymentType: "prod";
  convexCloudUrl: string;
  convexSiteUrl: string;
};

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

async function assertConvexDeploymentAttachmentIsMissing(args: {
  connection: ConvexActionConnection;
  expected: VaultConvexDeploymentAttachmentSnapshot;
}): Promise<void> {
  const observation = await observeConvexDeployment({
    convexToken: args.connection.token,
    convexTeamId: args.connection.teamId,
    projectId: args.expected.projectId,
    deploymentName: args.expected.deploymentName,
  });
  switch (observation.state) {
    case "missing":
      return;
    case "available":
      throw new Error("The attached Convex deployment still exists and cannot be replaced.");
    case "failed":
    case "loading":
    case "not_requested":
      throw new Error("Samebase could not confirm that the attached Convex deployment is missing.");
    default:
      observation satisfies never;
  }
}

function compareConvexProjectResult(left: ConvexProjectResult, right: ConvexProjectResult): number {
  return (
    left.projectName.localeCompare(right.projectName) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.projectId.localeCompare(right.projectId)
  );
}

function requireConvexProductionDeployment(args: {
  deployment: PlatformDeploymentResponse;
  projectId: string;
  description: string;
}): ConvexCloudDeployment {
  if (!isConvexCloudDeployment(args.deployment)) {
    throw new Error(`${args.description} was not cloud.`);
  }
  if (args.deployment.deploymentType !== "prod") {
    throw new Error(`${args.description} had the wrong deployment type.`);
  }
  if (args.deployment.projectId !== args.projectId) {
    throw new Error(`${args.description} belonged to a different project.`);
  }
  return args.deployment;
}

function requireDefaultConvexProductionDeployment(args: {
  deployment: PlatformDeploymentResponse;
  projectId: string;
  description: string;
}): ConvexCloudDeployment {
  const deployment = requireConvexProductionDeployment(args);
  if (deployment.isDefault !== true) {
    throw new Error(`${args.description} was not the default production deployment.`);
  }
  return deployment;
}

function buildConvexSiteUrl(deployment: ConvexCloudDeployment): string {
  return `https://${deployment.name}.convex.site`;
}

async function readConvexProjectDetails(args: {
  token: string;
  teamId: string;
  projectId: string;
}): Promise<ProjectResponse> {
  const project = await requestConvexManagementApi(args.token, "GET", "/projects/{project_id}", {
    params: { path: { project_id: args.projectId } },
  });
  if (project.teamId !== args.teamId) {
    throw new Error("Convex project belonged to a different team.");
  }
  return project;
}

async function readDefaultConvexProductionDeployment(args: {
  token: string;
  projectId: string;
}): Promise<ConvexCloudDeployment | null> {
  try {
    const deployment = await requestConvexManagementApi(
      args.token,
      "GET",
      "/projects/{project_id}/deployment",
      {
        params: {
          path: { project_id: args.projectId },
          query: { defaultProd: true },
        },
      },
    );
    return requireDefaultConvexProductionDeployment({
      deployment,
      projectId: args.projectId,
      description: "Default Convex production deployment",
    });
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function createConvexProductionDeployment(args: {
  token: string;
  projectId: string;
}): Promise<ConvexCloudDeployment> {
  const deployment = await requestConvexManagementApi(
    args.token,
    "POST",
    "/projects/{project_id}/create_deployment",
    {
      params: { path: { project_id: args.projectId } },
      body: { type: "prod" },
    },
  );
  return requireDefaultConvexProductionDeployment({
    deployment,
    projectId: args.projectId,
    description: "Created Convex production deployment",
  });
}

async function readOrCreateDefaultConvexProductionDeployment(args: {
  token: string;
  projectId: string;
}): Promise<ConvexCloudDeployment> {
  return (
    (await readDefaultConvexProductionDeployment(args)) ??
    (await createConvexProductionDeployment(args))
  );
}

function toConvexInfrastructureRecord(args: {
  project: ProjectResponse;
  deployment: ConvexCloudDeployment;
}): ConvexInfrastructureRecord {
  return {
    convexProjectId: args.project.id,
    convexTeamSlug: args.project.teamSlug,
    convexProjectSlug: args.project.slug,
    convexDeploymentName: args.deployment.name,
    convexDeploymentType: "prod",
    convexCloudUrl: args.deployment.deploymentUrl,
    convexSiteUrl: buildConvexSiteUrl(args.deployment),
  };
}

function toConvexProjectResult(project: ProjectResponse): ConvexProjectResult {
  return {
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    teamSlug: project.teamSlug,
  };
}

async function listProjectsForConnection(
  connection: ConvexActionConnection,
): Promise<ConvexProjectResult[]> {
  // TODO: Return provider pages incrementally once the project picker supports loading on scroll.
  const projects = await listConvexManagementProjects({
    token: connection.token,
    teamId: connection.teamId,
  });
  return projects.map(toConvexProjectResult).sort(compareConvexProjectResult);
}

async function resolveExistingConvexProject(args: {
  connection: ConvexActionConnection;
  projectId: string;
}): Promise<ConvexInfrastructureRecord> {
  const project = await readConvexProjectDetails({
    token: args.connection.token,
    teamId: args.connection.teamId,
    projectId: args.projectId,
  });
  const deployment = await readDefaultConvexProductionDeployment({
    token: args.connection.token,
    projectId: project.id,
  });
  if (!deployment) {
    throw new Error("Convex project does not have a default production deployment.");
  }
  return toConvexInfrastructureRecord({ project, deployment });
}

async function createConvexProjectDeployment(args: {
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">;
  connection: ConvexActionConnection;
  projectName: string;
  runId: Id<"workflow_vaultProvisioning_runs">;
  userId: Id<"users">;
  vaultId: Id<"vaults">;
}): Promise<ConvexInfrastructureRecord> {
  const reusableProject = await args.ctx.runQuery(
    internal.vault.convexMutations.readReusableCreatedProjectForRun,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      projectName: args.projectName,
    },
  );
  if (reusableProject) {
    const project = await readConvexProjectDetails({
      token: args.connection.token,
      teamId: args.connection.teamId,
      projectId: reusableProject.projectId,
    }).catch((error: unknown) => {
      if (!isConvexManagementNotFoundError(error)) {
        throw error;
      }
      return null;
    });
    if (project) {
      const deployment = await readOrCreateDefaultConvexProductionDeployment({
        token: args.connection.token,
        projectId: project.id,
      });
      return toConvexInfrastructureRecord({ project, deployment });
    }
  }

  const projects = await listConvexManagementProjects({
    token: args.connection.token,
    teamId: args.connection.teamId,
  });
  if (
    projects.some(
      (project) => project.name === args.projectName || project.slug === args.projectName,
    )
  ) {
    throw new Error(
      `Convex project name ${args.projectName} already exists. Choose another project name and try again.`,
    );
  }

  const createResponse = await requestConvexManagementApi(
    args.connection.token,
    "POST",
    "/teams/{team_id}/create_project",
    {
      params: { path: { team_id: args.connection.teamId } },
      body: {
        projectName: args.projectName,
        deploymentType: "prod",
      },
    },
  );
  await args.ctx.runMutation(internal.vault.convexMutations.recordCreatedProjectForRun, {
    vaultId: args.vaultId,
    runId: args.runId,
    userId: args.userId,
    projectName: args.projectName,
    projectId: createResponse.id,
    projectSlug: createResponse.slug,
  });
  const project = await readConvexProjectDetails({
    token: args.connection.token,
    teamId: args.connection.teamId,
    projectId: createResponse.id,
  });
  const deployment = await readOrCreateDefaultConvexProductionDeployment({
    token: args.connection.token,
    projectId: project.id,
  });

  return toConvexInfrastructureRecord({ project, deployment });
}

async function startConvexDeploymentConnectionOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    target: VaultConvexConnectionTarget;
    attachmentIntent: VaultConvexDeploymentAttachmentIntent;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.appProvisioningWorkflow.startConvexDeploymentConnection, args);
  } catch (error) {
    await ctx.runMutation(internal.infraProvisioning.markWorkflowStartupFailed, {
      runId: args.runId,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

async function isConvexDeploymentConnectionRunActive(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    appRoot: string;
    attachmentIntent: VaultConvexDeploymentAttachmentIntent;
  },
): Promise<boolean> {
  const result = await ctx.runQuery(
    internal.vault.convexMutations.readActiveConvexDeploymentConnection,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      appRoot: args.appRoot,
      attachmentIntent: args.attachmentIntent,
    },
  );
  return result.active;
}

async function recordConvexDeployment(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    appRoot: string;
    teamId: string;
    convex: ConvexInfrastructureRecord;
    origin: VaultConvexOrigin;
    attachmentIntent: VaultConvexDeploymentAttachmentIntent;
  },
): Promise<boolean> {
  await ctx.runMutation(internal.providerConnections.setConvexTeamSlug, {
    userId: args.userId,
    teamId: args.teamId,
    teamSlug: args.convex.convexTeamSlug,
  });
  const { attached } = await ctx.runMutation(
    internal.vault.convexMutations.attachDeploymentForRun,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      appRoot: args.appRoot,
      convex: args.convex,
      origin: args.origin,
      attachmentIntent: args.attachmentIntent,
    },
  );
  return attached;
}

export async function listConvexProjectsForUser(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { userId: Id<"users"> },
): Promise<ConvexProjectResult[]> {
  const connection = await resolveConvexConnection(ctx, args.userId);
  return await listProjectsForConnection(connection);
}

export const listProjects = action({
  access: convexListProjectsContract.access,
  args: convexListProjectsContract.args,
  returns: convexListProjectsContract.returns,
  mcp: convexListProjectsContract.mcp,
  handler: async (ctx): Promise<ConvexProjectResult[]> => {
    return await listConvexProjectsForUser(ctx, { userId: ctx.viewer.userId });
  },
});

export async function connectExistingConvexProjectForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: { userId: Id<"users">; vaultId: Id<"vaults">; appRoot: string; projectId: string },
): Promise<null> {
  const userId = args.userId;
  const appRoot = normalizeVaultAppRoot(args.appRoot);
  const projectId = args.projectId.trim();
  if (!projectId) {
    throw new Error("Convex project is required.");
  }
  const attachmentIntent = await ctx.runQuery(
    internal.vault.convexMutations.requireConvexDeploymentConnectionVault,
    {
      vaultId: args.vaultId,
      userId,
      appRoot,
    },
  );
  if (attachmentIntent.mode === "replace_missing") {
    await assertConvexDeploymentAttachmentIsMissing({
      connection: await resolveConvexConnection(ctx, userId),
      expected: attachmentIntent.expected,
    });
  }
  const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
    userId,
    vaultId: args.vaultId,
    trigger: "connect_convex_deployment",
  });
  await startConvexDeploymentConnectionOrFail(ctx, {
    vaultId: args.vaultId,
    runId,
    userId,
    attachmentIntent,
    target: {
      mode: "connect_existing_project",
      appRoot,
      projectId,
    },
  });

  return null;
}

export const connectExistingProject = action({
  access: convexConnectExistingProjectContract.access,
  args: convexConnectExistingProjectContract.args,
  returns: convexConnectExistingProjectContract.returns,
  mcp: convexConnectExistingProjectContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    return await connectExistingConvexProjectForUser(ctx, {
      ...args,
      userId: ctx.viewer.userId,
    });
  },
});

export const createProject = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
    projectName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const validation = validateAppResourceName(args.projectName, "convex");
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const userId = ctx.viewer.userId;
    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const attachmentIntent = await ctx.runQuery(
      internal.vault.convexMutations.requireConvexDeploymentConnectionVault,
      {
        vaultId: args.vaultId,
        userId,
        appRoot,
      },
    );
    if (attachmentIntent.mode === "replace_missing") {
      await assertConvexDeploymentAttachmentIsMissing({
        connection: await resolveConvexConnection(ctx, userId),
        expected: attachmentIntent.expected,
      });
    }
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "connect_convex_deployment",
    });
    await startConvexDeploymentConnectionOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      userId,
      attachmentIntent,
      target: {
        mode: "create_project",
        appRoot,
        projectName: validation.value,
      },
    });

    return null;
  },
});

export const ensureConvexDeploymentConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    target: vVaultConvexConnectionTarget,
    attachmentIntent: vVaultConvexDeploymentAttachmentIntent,
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    if (
      !(await isConvexDeploymentConnectionRunActive(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.target.appRoot,
        attachmentIntent: args.attachmentIntent,
      }))
    ) {
      return null;
    }

    const connection = await resolveConvexConnection(ctx, args.userId);
    if (args.attachmentIntent.mode === "replace_missing") {
      await assertConvexDeploymentAttachmentIsMissing({
        connection,
        expected: args.attachmentIntent.expected,
      });
    }
    switch (args.target.mode) {
      case "connect_existing_project": {
        const convex = await resolveExistingConvexProject({
          connection,
          projectId: args.target.projectId,
        });
        const attached = await recordConvexDeployment(ctx, {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          appRoot: args.target.appRoot,
          teamId: connection.teamId,
          convex,
          origin: "selected_existing",
          attachmentIntent: args.attachmentIntent,
        });
        if (!attached) {
          return null;
        }
        return null;
      }
      case "create_project": {
        const validation = validateAppResourceName(args.target.projectName, "convex");
        if (!validation.valid) {
          throw new Error(validation.message);
        }
        if (
          !(await isConvexDeploymentConnectionRunActive(ctx, {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appRoot: args.target.appRoot,
            attachmentIntent: args.attachmentIntent,
          }))
        ) {
          return null;
        }
        const convex = await createConvexProjectDeployment({
          ctx,
          connection,
          projectName: validation.value,
          runId: args.runId,
          userId: args.userId,
          vaultId: args.vaultId,
        });
        if (
          !(await isConvexDeploymentConnectionRunActive(ctx, {
            vaultId: args.vaultId,
            runId: args.runId,
            userId: args.userId,
            appRoot: args.target.appRoot,
            attachmentIntent: args.attachmentIntent,
          }))
        ) {
          return null;
        }
        const attached = await recordConvexDeployment(ctx, {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          appRoot: args.target.appRoot,
          teamId: connection.teamId,
          convex,
          origin: "provisioned",
          attachmentIntent: args.attachmentIntent,
        });
        if (!attached) {
          return null;
        }
        return null;
      }
    }

    args.target satisfies never;
    throw new Error("Unsupported Convex deployment connection target.");
  },
});
