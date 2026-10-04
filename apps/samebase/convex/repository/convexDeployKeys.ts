import type { PlatformCreateDeployKeyArgs } from "../convexManagementApi/generated/types.gen";
import { createConvexManagementClient } from "../convexManagementApi/client";
import { ConvexManagement } from "../convexManagementApi/generated/sdk.gen";

export type ConvexDeployKeyAllowedAction = NonNullable<
  PlatformCreateDeployKeyArgs["allowedActions"]
>[number];

export type ConvexDeployKeyAuthMethod = "api_key" | "oauth";

/**
 * Under an OAuth connection, Convex drops allowedActions and expiresAt and returns the team-wide
 * OAuth token as the deploy key. Keep such keys on the server.
 *
 * @see https://docs.convex.dev/management-api/create-deploy-key
 */
export async function createConvexDeploymentDeployKey(args: {
  allowedActions: readonly ConvexDeployKeyAllowedAction[];
  authMethod: ConvexDeployKeyAuthMethod;
  deploymentName: string;
  expiresAt?: number;
  name: string;
  token: string;
}): Promise<string> {
  const body =
    args.authMethod === "api_key"
      ? args.expiresAt === undefined
        ? {
            allowedActions: [...args.allowedActions],
            name: args.name,
          }
        : {
            allowedActions: [...args.allowedActions],
            expiresAt: args.expiresAt,
            name: args.name,
          }
      : {
          name: args.name,
        };
  const { deployKey } = await ConvexManagement.POST[
    "/deployments/{deployment_name}/create_deploy_key"
  ]({
    client: createConvexManagementClient({ token: args.token }),
    path: { deployment_name: args.deploymentName },
    body,
  });
  return deployKey;
}

export async function deleteConvexDeploymentDeployKey(args: {
  deploymentName: string;
  name: string;
  token: string;
}): Promise<void> {
  await ConvexManagement.POST["/deployments/{deployment_name}/delete_deploy_key"]({
    client: createConvexManagementClient({ token: args.token }),
    path: { deployment_name: args.deploymentName },
    body: { id: args.name },
  });
}
