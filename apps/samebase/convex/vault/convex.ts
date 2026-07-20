import { Infer, v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import {
  listConvexManagementProjects,
  requestConvexManagementApi,
} from "../convexManagementApi/client";
import type { ProjectResponse } from "../convexManagementApi/types.generated";
import { action } from "../functions";
import { toErrorMessage } from "../jsonUtils";
import { validateAppResourceName } from "../../shared/appResourceNames";
import { vVaultConvexProjectConnectionTarget } from "./model";
import { readConvexProjectResource } from "./convexProjectResources";
import { convexListProjectsContract, vConvexProjectResult } from "./contracts/convexListProjects";
import { convexConnectExistingProjectContract } from "./contracts/convexConnectExistingProject";

const { id, null: nullValue, string } = v;

type ConvexProjectResult = Infer<typeof vConvexProjectResult>;
type ConvexActionConnection = {
  token: string;
  teamId: string;
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
  if (project.teamId !== args.connection.teamId) {
    throw new Error("Convex project belonged to a different team.");
  }
  return project;
}

async function recordConvexProject(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    connection: ConvexActionConnection;
    project: ProjectResponse;
    origin: "provisioned" | "selected_existing";
  },
): Promise<Id<"vaultConvexProjects">> {
  await ctx.runMutation(internal.providerConnections.setConvexTeamSlug, {
    userId: args.userId,
    teamId: args.connection.teamId,
    teamSlug: args.project.teamSlug,
  });
  return await ctx.runMutation(internal.vault.convexMutations.attachProject, {
    vaultId: args.vaultId,
    userId: args.userId,
    appId: args.appId,
    teamId: args.connection.teamId,
    projectId: args.project.id,
    origin: args.origin,
  });
}

export async function connectExistingConvexProjectForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    projectId: string;
  },
): Promise<Id<"vaultConvexProjects">> {
  const projectId = args.projectId.trim();
  if (!projectId) {
    throw new Error("Convex project is required.");
  }
  await ctx.runQuery(internal.vault.convexMutations.requireConvexProjectConnectionVault, {
    vaultId: args.vaultId,
    userId: args.userId,
    appId: args.appId,
  });
  const connection = await resolveConvexConnection(ctx, args.userId);
  const project = await readConvexProject({ connection, projectId });
  return await recordConvexProject(ctx, {
    ...args,
    connection,
    project,
    origin: "selected_existing",
  });
}

async function createProjectForUser(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    projectName: string;
  },
): Promise<Id<"vaultConvexProjects">> {
  const validation = validateAppResourceName(args.projectName, "convex");
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  await ctx.runQuery(internal.vault.convexMutations.requireConvexProjectConnectionVault, {
    vaultId: args.vaultId,
    userId: args.userId,
    appId: args.appId,
  });
  const connection = await resolveConvexConnection(ctx, args.userId);
  const projects = await listConvexManagementProjects({
    token: connection.token,
    teamId: connection.teamId,
  });
  if (
    projects.some(
      (project) => project.name === validation.value || project.slug === validation.value,
    )
  ) {
    throw new Error(
      `Convex project name ${validation.value} already exists. Connect that project or choose another name.`,
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
  try {
    const project = await readConvexProject({
      connection,
      projectId: created.id,
    });
    return await recordConvexProject(ctx, {
      ...args,
      connection,
      project,
      origin: "provisioned",
    });
  } catch (error) {
    throw new Error(
      `Convex created project ${validation.value}, but Samebase could not attach it. Inspect Convex before retrying. Reason: ${toErrorMessage(error)}`,
    );
  }
}

async function createProjectForManagedWorkflow(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
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
  } else if (checkpoint.state === "creating") {
    throw new Error(
      "The previous Convex project create may have completed without recording its identity. Inspect Convex before retrying.",
    );
  } else {
    const projects = await listConvexManagementProjects({
      token: connection.token,
      teamId: connection.teamId,
    });
    if (
      projects.some(
        (project) => project.name === validation.value || project.slug === validation.value,
      )
    ) {
      throw new Error(
        `Convex project name ${validation.value} already exists. Choose another project name and try again.`,
      );
    }
    await ctx.runMutation(internal.vault.convexMutations.beginManagedProjectCreate, {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      projectName: validation.value,
      teamId: connection.teamId,
    });
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
    await ctx.runMutation(internal.vault.convexMutations.recordManagedProjectCreated, {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
      appId: args.appId,
      projectName: validation.value,
      teamId: connection.teamId,
      projectId,
    });
  }

  const project = await readConvexProject({ connection, projectId });
  return await recordConvexProject(ctx, {
    vaultId: args.vaultId,
    userId: args.userId,
    appId: args.appId,
    connection,
    project,
    origin: "provisioned",
  });
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

export const connectExistingProject = action({
  access: convexConnectExistingProjectContract.access,
  args: convexConnectExistingProjectContract.args,
  returns: convexConnectExistingProjectContract.returns,
  mcp: convexConnectExistingProjectContract.mcp,
  handler: async (ctx, args): Promise<null> => {
    await connectExistingConvexProjectForUser(ctx, { ...args, userId: ctx.viewer.userId });
    return null;
  },
});

export const createProject = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    appId: id("vaultApps"),
    projectName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    await createProjectForUser(ctx, { ...args, userId: ctx.viewer.userId });
    return null;
  },
});

export const removeMissingProject = action({
  access: "access_app_create",
  args: {
    vaultId: id("vaults"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const [attachment, connection] = await Promise.all([
      ctx.runQuery(internal.vault.convexMutations.readProjectAttachmentContext, {
        ...args,
        userId: ctx.viewer.userId,
      }),
      resolveConvexConnection(ctx, ctx.viewer.userId),
    ]);
    if (connection.teamId !== attachment.teamId) {
      throw new Error("Connect the Convex team that owns this project before removing it.");
    }
    const project = await readConvexProjectResource({
      token: connection.token,
      teamId: attachment.teamId,
      projectId: attachment.projectId,
    });
    if (project) {
      throw new Error("Convex project still exists. Reload its provider state.");
    }
    await ctx.runMutation(internal.vault.convexMutations.removeMissingProjectAttachment, {
      ...args,
      userId: ctx.viewer.userId,
      teamId: attachment.teamId,
      projectId: attachment.projectId,
    });
    return null;
  },
});

/** Used only by the explicit create-app workflow. Manual attachment actions do not create runs. */
export const ensureConvexProjectConnection = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    target: vVaultConvexProjectConnectionTarget,
  },
  returns: id("vaultConvexProjects"),
  handler: async (ctx, { vaultId, runId, userId, target }): Promise<Id<"vaultConvexProjects">> => {
    switch (target.mode) {
      case "connect_existing_project": {
        return await connectExistingConvexProjectForUser(ctx, {
          vaultId,
          userId,
          appId: target.appId,
          projectId: target.projectId,
        });
      }
      case "create_project": {
        return await createProjectForManagedWorkflow(ctx, {
          vaultId,
          runId,
          userId,
          appId: target.appId,
          projectName: target.projectName,
        });
      }
    }
    target satisfies never;
    throw new Error("Unsupported Convex project connection target.");
  },
});
