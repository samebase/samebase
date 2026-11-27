import * as management from "@distilled.cloud/convex/management";

import {
  isConvexCloudDeployment,
  isConvexManagementNotFoundError,
  runConvexManagement,
  toConvexId,
  type ConvexCloudDeployment,
  type ConvexDeployment,
  type ConvexProject,
} from "../convexManagementApi";

function requireDefaultProductionDeployment(args: {
  deployment: ConvexDeployment;
  projectId: string;
}): ConvexCloudDeployment {
  if (!isConvexCloudDeployment(args.deployment)) {
    throw new Error("Default Convex production deployment was not cloud.");
  }
  if (
    args.deployment.deploymentType !== "prod" ||
    String(args.deployment.projectId) !== args.projectId ||
    args.deployment.isDefault !== true ||
    !args.deployment.name ||
    !args.deployment.deploymentUrl
  ) {
    throw new Error("Convex returned an inconsistent default production deployment.");
  }
  return args.deployment;
}

export async function readConvexProjectResource(args: {
  token: string;
  teamId: string;
  projectId: string;
}): Promise<ConvexProject | null> {
  try {
    const project = await runConvexManagement(args.token, management.getProject, {
      projectId: toConvexId(args.projectId, "Convex project ID"),
    });
    if (String(project.teamId) !== args.teamId) {
      throw new Error("Convex project belonged to a different team.");
    }
    return project;
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function readConvexProductionDeployment(args: {
  token: string;
  projectId: string;
}): Promise<ConvexCloudDeployment | null> {
  try {
    const deployment = await runConvexManagement(args.token, management.getProjectDeployment, {
      projectId: toConvexId(args.projectId, "Convex project ID"),
      defaultProd: true,
    });
    return requireDefaultProductionDeployment({ deployment, projectId: args.projectId });
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}
