import type { components } from "../convexManagementApi/types.generated";
import { requestConvexManagementApi } from "../convexManagementApi/client";

export type ConvexDeployKeyAllowedAction = NonNullable<
  components["schemas"]["PlatformCreateDeployKeyArgs"]["allowedActions"]
>[number];

export type ConvexDeployKeyAuthMethod = "api_key" | "oauth";

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
  const { deployKey } = await requestConvexManagementApi(
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
  await requestConvexManagementApi(
    args.token,
    "POST",
    "/deployments/{deployment_name}/delete_deploy_key",
    {
      params: { path: { deployment_name: args.deploymentName } },
      body: { id: args.name },
    },
  );
}
