import * as management from "@distilled.cloud/convex/management";
import { Redacted } from "effect";

import { runConvexManagement } from "../convexManagementApi";

export type ConvexDeployKeyAllowedAction = NonNullable<
  management.CreateDeployKeyRequest["allowedActions"]
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
  const { deployKey } = await runConvexManagement(args.token, management.createDeployKey, {
    deploymentName: args.deploymentName,
    ...body,
  });
  return Redacted.value(deployKey);
}

export async function deleteConvexDeploymentDeployKey(args: {
  deploymentName: string;
  name: string;
  token: string;
}): Promise<void> {
  await runConvexManagement(args.token, management.deleteDeployKey, {
    deploymentName: args.deploymentName,
    id: args.name,
  });
}
