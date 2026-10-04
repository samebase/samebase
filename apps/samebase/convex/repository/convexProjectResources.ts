import {
  isConvexCloudDeployment,
  createConvexManagementClient,
  type ConvexCloudDeployment,
} from "../convexManagementApi/client";
import { ConvexManagement } from "../convexManagementApi/generated/sdk.gen";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import type {
  PlatformDeploymentResponse,
  ProjectResponse,
} from "../convexManagementApi/generated/types.gen";

function requireDefaultProductionDeployment(args: {
  deployment: PlatformDeploymentResponse;
  projectId: string;
}): ConvexCloudDeployment {
  if (!isConvexCloudDeployment(args.deployment)) {
    throw new Error("Default Convex production deployment was not cloud.");
  }
  if (
    args.deployment.deploymentType !== "prod" ||
    args.deployment.projectId !== args.projectId ||
    args.deployment.isDefault !== true
  ) {
    throw new Error("Convex returned an inconsistent default production deployment.");
  }
  return args.deployment;
}

export async function readConvexProjectResource(args: {
  token: string;
  teamId: string;
  projectId: string;
}): Promise<ProjectResponse | null> {
  try {
    const project = await ConvexManagement.GET["/projects/{project_id}"]({
      client: createConvexManagementClient({ token: args.token }),
      path: { project_id: args.projectId },
    });
    if (project.teamId !== args.teamId) {
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
    const deployment = await ConvexManagement.GET["/projects/{project_id}/deployment"]({
      client: createConvexManagementClient({ token: args.token }),
      path: { project_id: args.projectId },
      query: { defaultProd: true },
    });
    return requireDefaultProductionDeployment({ deployment, projectId: args.projectId });
  } catch (error) {
    if (isConvexManagementNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function readConvexPreviewDeployments(args: {
  token: string;
  projectId: string;
}): Promise<ConvexCloudDeployment[]> {
  const deployments = await ConvexManagement.GET["/projects/{project_id}/list_deployments"]({
    client: createConvexManagementClient({ token: args.token }),
    path: { project_id: args.projectId },
    query: {
      includeLocal: false,
      isDefault: false,
      deploymentType: "preview",
    },
  });
  const previews: ConvexCloudDeployment[] = [];

  for (const deployment of deployments) {
    if (
      !isConvexCloudDeployment(deployment) ||
      deployment.deploymentType !== "preview" ||
      deployment.projectId !== args.projectId ||
      deployment.isDefault
    ) {
      throw new Error("Convex returned an inconsistent preview deployment.");
    }
    previews.push(deployment);
  }

  return previews.sort(
    (left, right) =>
      (right.lastDeployTime ?? right.createTime) - (left.lastDeployTime ?? left.createTime) ||
      left.name.localeCompare(right.name),
  );
}
