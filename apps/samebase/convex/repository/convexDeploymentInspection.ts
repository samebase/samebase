import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import { isRecord, toErrorMessage } from "../jsonUtils";
import { requireRepositoryForUser } from "../organizationAccess";
import { getOrganizationProviderConfiguration } from "../organizationProviderCredentials";
import {
  createConvexDeploymentDeployKey,
  deleteConvexDeploymentDeployKey,
  type ConvexDeployKeyAllowedAction,
  type ConvexDeployKeyAuthMethod,
} from "./convexDeployKeys";
import { vRepositoryConvexProjectDocument } from "./model";
import { isLiveConnectedRepository } from "./state";

const { id, literal, object, string, union } = v;

type ConvexInspectionTarget = {
  authMethod: ConvexDeployKeyAuthMethod;
  project: Doc<"repositoryConvexProjects">;
  token: string;
};
type ConvexSystemQueryResponse = {
  value: unknown;
};

const CONVEX_INSPECTION_REQUEST_TIMEOUT_MS = 10_000;
const CONVEX_INSPECTION_KEY_TTL_MS = 31 * 60 * 1000;
const CONVEX_INSPECTION_DEPLOY_KEY_ALLOWED_ACTIONS = [
  "deployment:data:view",
] satisfies ConvexDeployKeyAllowedAction[];

const vConvexProviderAuthMethod = union(literal("api_key"), literal("oauth"));
const vConvexInspectionTarget = object({
  token: string(),
  authMethod: vConvexProviderAuthMethod,
  project: vRepositoryConvexProjectDocument,
});

export const readTarget = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: vConvexInspectionTarget,
  handler: async (ctx, args): Promise<ConvexInspectionTarget> => {
    const repository = await requireRepositoryForUser(ctx.db, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    if (!isLiveConnectedRepository(repository)) {
      throw new Error("Repository not found.");
    }

    const project = await ctx.db.get(args.convexProjectId);
    if (
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId
    ) {
      throw new Error("Convex project not found.");
    }

    const configuration = await getOrganizationProviderConfiguration(
      ctx.db,
      repository.organizationId,
    );
    const credential = configuration.convexCredential;
    if (configuration.convexTeam?.teamId !== repository.convexTeamId || !credential) {
      throw new Error("Convex connection is required.");
    }
    const token = credential.auth.credential.trim();
    if (!token) {
      throw new Error("Convex connection is required.");
    }
    return {
      token,
      authMethod: credential.auth.method,
      project,
    };
  },
});

/**
Mints a short-lived `deployment:data:view` deploy key for `deployment`, passes it to `inspect`, and
revokes it afterwards. Under an OAuth connection the key is the team-wide OAuth token, so `inspect`
must keep it on the server.

`purpose` names the key in the Convex dashboard, such as `samebase-schema-<deployment>-<time>`.
*/
export async function withConvexInspectionDeployKey<Result>(
  args: {
    deployment: ConvexCloudDeployment;
    purpose: "components" | "schema";
    target: ConvexInspectionTarget;
  },
  inspect: (deployKey: string) => Promise<Result>,
): Promise<Result> {
  const normalizedDeploymentName = args.deployment.name
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 40);
  const name = `samebase-${args.purpose}-${normalizedDeploymentName}-${Date.now().toString(36)}`;
  const deployKey = await createConvexDeploymentDeployKey({
    allowedActions: CONVEX_INSPECTION_DEPLOY_KEY_ALLOWED_ACTIONS,
    authMethod: args.target.authMethod,
    deploymentName: args.deployment.name,
    expiresAt: Date.now() + CONVEX_INSPECTION_KEY_TTL_MS,
    name,
    token: args.target.token,
  });

  try {
    return await inspect(deployKey);
  } finally {
    try {
      await deleteConvexDeploymentDeployKey({
        deploymentName: args.deployment.name,
        name,
        token: args.target.token,
      });
    } catch (error) {
      console.warn("convex_deployment_inspection:deploy_key_cleanup_failed", {
        deploymentName: args.deployment.name,
        message: toErrorMessage(error),
      });
    }
  }
}

export async function fetchConvexDeploymentJson(args: {
  deployKey: string;
  deploymentUrl: string;
  path: string;
  body?: unknown;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONVEX_INSPECTION_REQUEST_TIMEOUT_MS);
  const headers = new Headers({
    Authorization: `Convex ${args.deployKey}`,
    "Content-Type": "application/json",
  });
  let body: string | undefined;
  if (args.body !== undefined) {
    body = JSON.stringify(args.body);
  }

  try {
    const response = await fetch(new Request(`${args.deploymentUrl}${args.path}`), {
      method: args.body === undefined ? "GET" : "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Convex deployment request failed: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Convex deployment request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchConvexSystemQuery(args: {
  deployKey: string;
  deploymentUrl: string;
  path: string;
  queryArgs: unknown;
}): Promise<ConvexSystemQueryResponse | null> {
  const response = await fetchConvexDeploymentJson({
    deployKey: args.deployKey,
    deploymentUrl: args.deploymentUrl,
    path: "/api/query",
    body: {
      path: args.path,
      args: args.queryArgs,
      format: "json",
    },
  });
  if (!isRecord(response) || !("value" in response)) {
    return null;
  }
  return { value: response["value"] };
}
