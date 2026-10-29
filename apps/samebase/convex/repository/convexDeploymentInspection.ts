import {
  array as sureArray,
  literal as sureLiteral,
  object as sureObject,
  string as sureString,
  union as sureUnion,
  unknown as sureUnknown,
} from "@samebase/sure";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type ActionCtx } from "../_generated/server";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import { isRecord, toErrorMessage } from "../jsonUtils";
import { requireRepositoryForUser } from "../organizationAccess";
import { getOrganizationProviderConfiguration } from "../organizationProviderCredentials";
import { organizationProviderCredentialAad } from "../organization/providerCredentialModel";
import { openSecret, vSealedSecret } from "../sealedSecret";
import {
  createConvexDeploymentDeployKey,
  deleteConvexDeploymentDeployKey,
  type ConvexDeployKeyAllowedAction,
  type ConvexDeployKeyAuthMethod,
} from "./convexDeployKeys";
import { vRepositoryConvexProjectDocument } from "./model";
import { isLiveConnectedRepository } from "./state";

const { array, id, literal, object, string, union } = v;

export type ConvexInspectionTarget = {
  authMethod: ConvexDeployKeyAuthMethod;
  /** `owner/name` on GitHub. */
  githubRepositoryFullName: string;
  /** The Convex projects attached to the repository. */
  projects: Doc<"repositoryConvexProjects">[];
  /** The Convex team that the organization connected. */
  teamId: string;
  /** The organization's Convex token, opened in the action. */
  token: string;
};
type ConvexSystemQueryResponse = {
  value: unknown;
};

const CONVEX_INSPECTION_REQUEST_TIMEOUT_MS = 10_000;
const CONVEX_INSPECTION_KEY_TTL_MS = 31 * 60 * 1000;
/**
The components and schema reads call system queries, which need `deployment:data:view`. The
Alchemy state reads call internal queries of the store, and the Alchemy reader connection calls only
the internal mutation `reader:authorize`, which issues a repository read token.
*/
const CONVEX_INSPECTION_DEPLOY_KEY_ALLOWED_ACTIONS = {
  alchemyState: ["deployment:functions:runInternalQueries"],
  alchemyReader: ["deployment:functions:runInternalMutations"],
  components: ["deployment:data:view"],
  schema: ["deployment:data:view"],
} satisfies Record<string, ConvexDeployKeyAllowedAction[]>;

const vConvexProviderAuthMethod = union(literal("api_key"), literal("oauth"));
const vSealedConvexInspectionTarget = object({
  organizationId: id("organizations"),
  credential: vSealedSecret,
  authMethod: vConvexProviderAuthMethod,
  githubRepositoryFullName: string(),
  projects: array(vRepositoryConvexProjectDocument),
  teamId: string(),
});

export const readTarget = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
  },
  returns: vSealedConvexInspectionTarget,
  handler: async (ctx, args) => {
    const repository = await requireRepositoryForUser(ctx.db, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    });
    const organization = await ctx.db.get(repository.organizationId);
    if (!isLiveConnectedRepository(repository) || !organization) {
      throw new Error("Repository not found.");
    }

    const projects = await ctx.db
      .query("repositoryConvexProjects")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();

    const configuration = await getOrganizationProviderConfiguration(
      ctx.db,
      repository.organizationId,
    );
    const { convexCredential: credential, convexTeam } = configuration;
    if (!convexTeam || convexTeam.teamId !== repository.convexTeamId || !credential) {
      throw new Error("Convex connection is required.");
    }
    return {
      organizationId: repository.organizationId,
      credential: credential.auth.credential,
      authMethod: credential.auth.method,
      githubRepositoryFullName: `${organization.githubOwnerLogin}/${repository.githubRepositoryName}`,
      projects: projects.filter((project) => project.organizationId === repository.organizationId),
      teamId: convexTeam.teamId,
    };
  },
});

/** The inspection target of a repository, with the organization's Convex token opened. */
export async function readConvexInspectionTarget(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<ConvexInspectionTarget> {
  const target = await ctx.runQuery(internal.repository.convexDeploymentInspection.readTarget, {
    repositoryId: args.repositoryId,
    userId: args.userId,
  });
  const token = (
    await openSecret({
      sealed: target.credential,
      aad: organizationProviderCredentialAad(target.organizationId, "convex.auth.credential"),
    })
  ).trim();
  if (!token) {
    throw new Error("Convex connection is required.");
  }
  return {
    authMethod: target.authMethod,
    githubRepositoryFullName: target.githubRepositoryFullName,
    projects: target.projects,
    teamId: target.teamId,
    token,
  };
}

/**
Mints a short-lived deploy key for `deployment` with the allowed actions of `purpose`,
passes it to `inspect`, and revokes it afterwards. Under an OAuth connection the key is the team-wide OAuth token, so `inspect`
must keep it on the server.

`purpose` names the key in the Convex dashboard, such as `samebase-schema-<deployment>-<time>`.
*/
export async function withConvexInspectionDeployKey<Result>(
  args: {
    deployment: ConvexCloudDeployment;
    purpose: keyof typeof CONVEX_INSPECTION_DEPLOY_KEY_ALLOWED_ACTIONS;
    target: Pick<ConvexInspectionTarget, "authMethod" | "token">;
  },
  inspect: (deployKey: string) => Promise<Result>,
): Promise<Result> {
  const normalizedDeploymentName = args.deployment.name
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 40);
  const name = `samebase-${args.purpose}-${normalizedDeploymentName}-${Date.now().toString(36)}`;
  const deployKey = await createConvexDeploymentDeployKey({
    allowedActions: CONVEX_INSPECTION_DEPLOY_KEY_ALLOWED_ACTIONS[args.purpose],
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
  /** `Convex <deploy key>`, or `Bearer <token>` for a token that the deployment accepts. */
  authorization: string;
  deploymentUrl: string;
  path: string;
  body?: unknown;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONVEX_INSPECTION_REQUEST_TIMEOUT_MS);
  const headers = new Headers({
    Authorization: args.authorization,
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
    authorization: `Convex ${args.deployKey}`,
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

const sureSystemQueryBatchResponse = sureObject({
  results: sureArray(
    sureUnion(
      sureObject({ status: sureLiteral("success"), value: sureUnknown }),
      sureObject({ status: sureLiteral("error"), errorMessage: sureString }),
    ),
  ),
});

/**
Runs `queries` in one `/api/query_batch` request, at one database snapshot, and returns their values
in the same order. Convex reports each query error separately; this throws on the first one so a
caller never shows a partial read.
*/
export async function fetchConvexSystemQueryBatch(args: {
  deployKey: string;
  deploymentUrl: string;
  queries: { path: string; args: Record<string, unknown> }[];
}): Promise<unknown[]> {
  const response = await fetchConvexDeploymentJson({
    authorization: `Convex ${args.deployKey}`,
    deploymentUrl: args.deploymentUrl,
    path: "/api/query_batch",
    body: {
      queries: args.queries.map((query) => ({
        path: query.path,
        args: query.args,
        format: "json",
      })),
    },
  });
  const [valid, batch] = sureSystemQueryBatchResponse(response);
  if (!valid || batch.results.length !== args.queries.length) {
    throw new Error("Convex returned an unexpected query batch response.");
  }

  return batch.results.map((result) => {
    if (result.status === "error") {
      throw new Error(result.errorMessage);
    }
    return result.value;
  });
}
