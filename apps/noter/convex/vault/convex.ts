import { Infer, v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getUserId } from "../common";
import {
  isConvexCloudDeployment,
  requestConvexManagementApi,
  type ConvexCloudDeployment,
} from "../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import type {
  PlatformDeploymentResponse,
  PlatformProjectDetails,
} from "../convexManagementApi/types.generated";
import { toErrorMessage } from "../jsonUtils";
import { validateAppResourceName } from "../../shared/appResourceNames";
import {
  vVaultConvexConnectionTarget,
  type VaultConvexConnectionTarget,
  type VaultConvexOrigin,
} from "./model";
import { normalizeCloudflareAppRoot } from "../../shared/cloudflareAppRoot";

const { array, id, null: nullValue, object, string } = v;

const convexProjectResult = object({
  projectId: string(),
  projectName: string(),
  projectSlug: string(),
  teamSlug: string(),
});

type ConvexProjectResult = Infer<typeof convexProjectResult>;
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

async function listConvexProjects(args: {
  token: string;
  teamId: string;
}): Promise<PlatformProjectDetails[]> {
  return await requestConvexManagementApi(args.token, "GET", "/teams/{team_id}/list_projects", {
    params: { path: { team_id: args.teamId } },
  });
}

async function readConvexProjectDetails(args: {
  token: string;
  teamId: string;
  projectId: string;
}): Promise<PlatformProjectDetails> {
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
  project: PlatformProjectDetails;
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

function toConvexProjectResult(project: PlatformProjectDetails): ConvexProjectResult {
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
  const projects = await listConvexProjects({
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
  runId: Id<"appProvisioningRuns">;
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
    });
    const deployment = await readOrCreateDefaultConvexProductionDeployment({
      token: args.connection.token,
      projectId: project.id,
    });
    return toConvexInfrastructureRecord({ project, deployment });
  }

  const projects = await listConvexProjects({
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
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    target: VaultConvexConnectionTarget;
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
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
  },
): Promise<boolean> {
  const result = await ctx.runQuery(
    internal.vault.convexMutations.readActiveConvexDeploymentConnection,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      appRoot: args.appRoot,
    },
  );
  return result.active;
}

async function recordConvexDeployment(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appRoot: string;
    teamId: string;
    convex: ConvexInfrastructureRecord;
    origin: VaultConvexOrigin;
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
    },
  );
  return attached;
}

export const listProjects = action({
  args: {},
  returns: array(convexProjectResult),
  handler: async (ctx): Promise<ConvexProjectResult[]> => {
    const userId = await getUserId(ctx);
    const connection = await resolveConvexConnection(ctx, userId);
    return await listProjectsForConnection(connection);
  },
});

export const connectExistingProject = action({
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
    projectId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const appRoot = normalizeCloudflareAppRoot(args.appRoot);
    const projectId = args.projectId.trim();
    if (!projectId) {
      throw new Error("Convex project is required.");
    }
    await ctx.runQuery(internal.vault.convexMutations.requireConvexDeploymentConnectionVault, {
      vaultId: args.vaultId,
      userId,
      appRoot,
    });
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "connect_convex_deployment",
    });
    await startConvexDeploymentConnectionOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      userId,
      target: {
        mode: "connect_existing_project",
        appRoot,
        projectId,
      },
    });

    return null;
  },
});

export const createProject = action({
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

    const userId = await getUserId(ctx);
    const appRoot = normalizeCloudflareAppRoot(args.appRoot);
    await ctx.runQuery(internal.vault.convexMutations.requireConvexDeploymentConnectionVault, {
      vaultId: args.vaultId,
      userId,
      appRoot,
    });
    const runId = await ctx.runMutation(internal.appProvisioningRuns.createForVault, {
      userId,
      vaultId: args.vaultId,
      trigger: "connect_convex_deployment",
    });
    await startConvexDeploymentConnectionOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      userId,
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
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    target: vVaultConvexConnectionTarget,
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    if (
      !(await isConvexDeploymentConnectionRunActive(ctx, {
        vaultId: args.vaultId,
        runId: args.runId,
        userId: args.userId,
        appRoot: args.target.appRoot,
      }))
    ) {
      return null;
    }

    const connection = await resolveConvexConnection(ctx, args.userId);
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
