import { isConvexCloudDeployment, requestConvexManagementApi } from "../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import type { ConvexDeploymentObservation } from "./providerResourceObservationModel";

export function buildConvexProjectSettingsDashboardUrl(args: {
  projectSlug: string;
  teamSlug: string;
}): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(args.teamSlug)}/${encodeURIComponent(args.projectSlug)}/settings`;
}

export function buildConvexDeploymentDashboardUrl(args: {
  deploymentName: string;
  projectSlug: string;
  teamSlug: string;
}): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(args.teamSlug)}/${encodeURIComponent(args.projectSlug)}/${encodeURIComponent(args.deploymentName)}`;
}

export async function observeConvexDeployment(args: {
  convexToken: string;
  convexTeamId: string;
  projectId: string;
  deploymentName: string;
}): Promise<ConvexDeploymentObservation> {
  const observedAt = Date.now();
  try {
    const [project, deployment] = await Promise.all([
      requestConvexManagementApi(args.convexToken, "GET", "/projects/{project_id}", {
        params: { path: { project_id: args.projectId } },
      }),
      requestConvexManagementApi(args.convexToken, "GET", "/deployments/{deployment_name}", {
        params: { path: { deployment_name: args.deploymentName } },
      }),
    ]);
    if (
      project.id !== args.projectId ||
      project.teamId !== args.convexTeamId ||
      !isConvexCloudDeployment(deployment) ||
      deployment.projectId !== args.projectId ||
      deployment.name !== args.deploymentName
    ) {
      return { state: "missing", observedAt };
    }
    return {
      state: "available",
      observedAt,
      projectSlug: project.slug,
      teamSlug: project.teamSlug,
      cloudUrl: deployment.deploymentUrl,
      siteUrl: `https://${deployment.name}.convex.site`,
      projectSettingsDashboardUrl: buildConvexProjectSettingsDashboardUrl({
        projectSlug: project.slug,
        teamSlug: project.teamSlug,
      }),
      deploymentDashboardUrl: buildConvexDeploymentDashboardUrl({
        deploymentName: deployment.name,
        projectSlug: project.slug,
        teamSlug: project.teamSlug,
      }),
    };
  } catch (error) {
    return isConvexManagementNotFoundError(error)
      ? { state: "missing", observedAt }
      : { state: "failed", observedAt, reason: "provider_failure" };
  }
}
