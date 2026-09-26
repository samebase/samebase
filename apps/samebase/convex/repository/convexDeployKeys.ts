import type { components } from "../convexManagementApi/types.generated";
import { requestConvexManagementApiOrThrow } from "../convexManagementApi/client";

export type ConvexDeployKeyAllowedAction = NonNullable<
  components["schemas"]["PlatformCreateDeployKeyArgs"]["allowedActions"]
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
  const { deployKey } = await requestConvexManagementApiOrThrow(
    args.token,
    "POST",
    "/deployments/{deployment_name}/create_deploy_key",
    {
      params: { path: { deployment_name: args.deploymentName } },
      body,
    },
  );
  return deployKey;
}

export async function deleteConvexDeploymentDeployKey(args: {
  deploymentName: string;
  name: string;
  token: string;
}): Promise<void> {
  await requestConvexManagementApiOrThrow(
    args.token,
    "POST",
    "/deployments/{deployment_name}/delete_deploy_key",
    {
      params: { path: { deployment_name: args.deploymentName } },
      body: { id: args.name },
    },
  );
}
