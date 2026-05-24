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

const { array, id, null: nullValue, object, string } = v;

const convexDeploymentResult = object({
  projectId: string(),
  projectName: string(),
  projectSlug: string(),
  teamSlug: string(),
  deploymentName: string(),
  cloudUrl: string(),
  siteUrl: string(),
});

type ConvexDeploymentResult = Infer<typeof convexDeploymentResult>;
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

function compareConvexDeploymentResult(
  left: ConvexDeploymentResult,
  right: ConvexDeploymentResult,
): number {
  return (
    left.projectName.localeCompare(right.projectName) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.deploymentName.localeCompare(right.deploymentName) ||
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
  if (args.deployment.isDefault !== true) {
    throw new Error(`${args.description} was not the default production deployment.`);
  }
  return args.deployment;
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
    return requireConvexProductionDeployment({
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

async function readConvexProductionDeployment(args: {
  token: string;
  projectId: string;
  deploymentName: string;
}): Promise<ConvexCloudDeployment> {
  const deployment = await requestConvexManagementApi(
    args.token,
    "GET",
    "/deployments/{deployment_name}",
    {
      params: {
        path: { deployment_name: args.deploymentName },
      },
    },
  );
  return requireConvexProductionDeployment({
    deployment,
    projectId: args.projectId,
    description: "Selected Convex production deployment",
  });
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
  return requireConvexProductionDeployment({
    deployment,
    projectId: args.projectId,
    description: "Created Convex production deployment",
  });
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

function toConvexDeploymentResult(args: {
  project: PlatformProjectDetails;
  deployment: ConvexCloudDeployment;
}): ConvexDeploymentResult {
  return {
    projectId: args.project.id,
    projectName: args.project.name,
    projectSlug: args.project.slug,
    teamSlug: args.project.teamSlug,
    deploymentName: args.deployment.name,
    cloudUrl: args.deployment.deploymentUrl,
    siteUrl: buildConvexSiteUrl(args.deployment),
  };
}

async function listProductionDeploymentsForConnection(
  connection: ConvexActionConnection,
): Promise<ConvexDeploymentResult[]> {
  const projects = await listConvexProjects({
    token: connection.token,
    teamId: connection.teamId,
  });
  const deployments: ConvexDeploymentResult[] = [];
  for (const project of projects) {
    const deployment = await readDefaultConvexProductionDeployment({
      token: connection.token,
      projectId: project.id,
    });
    if (deployment) {
      deployments.push(toConvexDeploymentResult({ project, deployment }));
    }
  }
  return deployments.sort(compareConvexDeploymentResult);
}

async function resolveExistingConvexDeployment(args: {
  connection: ConvexActionConnection;
  projectId: string;
  deploymentName: string;
}): Promise<ConvexInfrastructureRecord> {
  const project = await readConvexProjectDetails({
    token: args.connection.token,
    teamId: args.connection.teamId,
    projectId: args.projectId,
  });
  const deployment = await readConvexProductionDeployment({
    token: args.connection.token,
    projectId: project.id,
    deploymentName: args.deploymentName,
  });
  return toConvexInfrastructureRecord({ project, deployment });
}

async function createConvexProjectDeployment(args: {
  ctx: Pick<ActionCtx, "runMutation">;
  connection: ConvexActionConnection;
  projectName: string;
  runId: Id<"appProvisioningRuns">;
  userId: Id<"users">;
  vaultId: Id<"vaults">;
}): Promise<ConvexInfrastructureRecord> {
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
  const deployment =
    (await readDefaultConvexProductionDeployment({
      token: args.connection.token,
      projectId: project.id,
    })) ??
    (await createConvexProductionDeployment({
      token: args.connection.token,
      projectId: project.id,
    }));

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
  },
): Promise<boolean> {
  const result = await ctx.runQuery(
    internal.vault.convexMutations.readActiveConvexDeploymentConnection,
    {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
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
    teamId: string;
    convex: ConvexInfrastructureRecord;
    origin: VaultConvexOrigin;
  },
): Promise<void> {
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
      convex: args.convex,
      origin: args.origin,
    },
  );
  if (!attached) {
    throw new Error("Convex deployment connection did not attach a deployment.");
  }
}

export const listProductionDeployments = action({
  args: {},
  returns: array(convexDeploymentResult),
  handler: async (ctx): Promise<ConvexDeploymentResult[]> => {
    const userId = await getUserId(ctx);
    const connection = await resolveConvexConnection(ctx, userId);
    return await listProductionDeploymentsForConnection(connection);
  },
});

export const connectExistingDeployment = action({
  args: {
    vaultId: id("vaults"),
    projectId: string(),
    deploymentName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const projectId = args.projectId.trim();
    const deploymentName = args.deploymentName.trim();
    if (!projectId) {
      throw new Error("Convex project is required.");
    }
    if (!deploymentName) {
      throw new Error("Convex deployment is required.");
    }
    await ctx.runQuery(internal.vault.convexMutations.requireConvexDeploymentConnectionVault, {
      vaultId: args.vaultId,
      userId,
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
        mode: "connect_existing_deployment",
        projectId,
        deploymentName,
      },
    });

    return null;
  },
});

export const createProject = action({
  args: {
    vaultId: id("vaults"),
    projectName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const validation = validateAppResourceName(args.projectName, "convex");
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const userId = await getUserId(ctx);
    await ctx.runQuery(internal.vault.convexMutations.requireConvexDeploymentConnectionVault, {
      vaultId: args.vaultId,
      userId,
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
    if (!(await isConvexDeploymentConnectionRunActive(ctx, args))) {
      return null;
    }

    const connection = await resolveConvexConnection(ctx, args.userId);
    switch (args.target.mode) {
      case "connect_existing_deployment": {
        const convex = await resolveExistingConvexDeployment({
          connection,
          projectId: args.target.projectId,
          deploymentName: args.target.deploymentName,
        });
        await recordConvexDeployment(ctx, {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          teamId: connection.teamId,
          convex,
          origin: "selected_existing",
        });
        return null;
      }
      case "create_project": {
        const validation = validateAppResourceName(args.target.projectName, "convex");
        if (!validation.valid) {
          throw new Error(validation.message);
        }
        if (!(await isConvexDeploymentConnectionRunActive(ctx, args))) {
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
        if (!(await isConvexDeploymentConnectionRunActive(ctx, args))) {
          return null;
        }
        await recordConvexDeployment(ctx, {
          vaultId: args.vaultId,
          runId: args.runId,
          userId: args.userId,
          teamId: connection.teamId,
          convex,
          origin: "provisioned",
        });
        return null;
      }
    }

    args.target satisfies never;
    throw new Error("Unsupported Convex deployment connection target.");
  },
});
