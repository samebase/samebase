import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type ActionCtx } from "../_generated/server";
import { action } from "../functions";
import type { AuthenticatedAppViewer } from "../functions";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  createConvexDeploymentDeployKey,
  deleteConvexDeploymentDeployKey,
  type ConvexDeployKeyAllowedAction,
} from "./convexDeployKeys";
import { readAlchemyStack, readProductionConvexDeployments } from "./alchemyState";
import { readConvexProductionDeployment } from "./convexProjectResources";
import { requireRepositoryForUser, requireRepositoryOrganization } from "../organizationAccess";
import { isLiveConnectedRepository } from "./state";

const { id, literal, object, string, union } = v;

const EMBEDDED_DASHBOARD_DEPLOY_KEY_TTL_MS = 60 * 60 * 1000;
const EMBEDDED_DASHBOARD_ALLOWED_ACTIONS = [
  "deployment:data:view",
  "deployment:data:write",
] satisfies ConvexDeployKeyAllowedAction[];

const embeddedDashboardCredentialsResult = union(
  object({
    kind: literal("ready"),
    deploymentUrl: string(),
    deploymentName: string(),
    deployKeyName: string(),
    adminKey: string(),
  }),
  object({
    kind: literal("missing_repository"),
  }),
  object({
    kind: literal("unsupported_branch"),
    defaultBranch: string(),
  }),
  object({
    kind: literal("missing_deployment"),
  }),
  object({
    kind: literal("missing_connection"),
  }),
  object({
    kind: literal("oauth_connection"),
  }),
);
type EmbeddedDashboardCredentialsResult = Infer<typeof embeddedDashboardCredentialsResult>;
type RepositoryDatabaseLookup = {
  repositoryId: Id<"repositories">;
  organizationId: Id<"organizations">;
  defaultBranch: string | undefined;
} | null;
type RepositoryDatabaseActionCtx = Pick<ActionCtx, "runQuery"> & {
  viewer: AuthenticatedAppViewer;
};
type ReadyRepositoryDatabaseDeploymentContext = {
  kind: "ready";
  deployment: ConvexCloudDeployment;
  convexCredential: {
    auth: { method: "api_key" | "oauth"; credential: string };
  };
};
type RepositoryDatabaseDeploymentContext =
  | ReadyRepositoryDatabaseDeploymentContext
  | Exclude<EmbeddedDashboardCredentialsResult, { kind: "ready" }>;

/**
attachment = `convexProjectId` names an attachment row of the repository.

stack = `convexProjectId` names no attachment row; the caller accepts it only as the Convex project
id of a deployment that the production stage of `stack`, the repository stack, deploys.
*/
export const readEmbeddedDashboardProject = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    convexProjectId: string(),
  },
  returns: union(
    object({
      source: literal("attachment"),
      teamId: string(),
      projectId: string(),
    }),
    object({
      source: literal("stack"),
      teamId: string(),
      stack: string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const repository = await requireRepositoryForUser(ctx.db, args);
    const attachmentId = ctx.db.normalizeId("repositoryConvexProjects", args.convexProjectId);
    if (!attachmentId) {
      if (!isLiveConnectedRepository(repository) || !repository.convexTeamId) {
        return null;
      }
      const organization = await requireRepositoryOrganization(ctx.db, repository);
      return {
        source: "stack" as const,
        teamId: repository.convexTeamId,
        stack: `${organization.githubOwnerLogin}/${repository.githubRepositoryName}`,
      };
    }

    const project = await ctx.db.get(attachmentId);
    if (
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId ||
      project.teamId !== repository.convexTeamId
    ) {
      return null;
    }

    return {
      source: "attachment" as const,
      teamId: project.teamId,
      projectId: project.projectId,
    };
  },
});

function buildEmbeddedDashboardDeployKeyName(args: {
  deploymentName: string;
  expiresAt: number;
}): string {
  return `samebase-embedded-data-${args.deploymentName}-${args.expiresAt}`;
}

function isEmbeddedDashboardDeployKeyName(args: {
  deploymentName: string;
  deployKeyName: string;
}): boolean {
  const prefix = `samebase-embedded-data-${args.deploymentName}-`;
  if (!args.deployKeyName.startsWith(prefix)) {
    return false;
  }
  const expiresAtText = args.deployKeyName.slice(prefix.length);
  const expiresAt = Number(expiresAtText);
  return Number.isSafeInteger(expiresAt) && expiresAt > 0 && String(expiresAt) === expiresAtText;
}

/**
`projectId` when the production stage of the repository stack deploys a Convex deployment of that
project in the connected team, else null.
*/
async function readStackProjectId(args: {
  convexTeam: { teamId: string };
  credential: { auth: { method: "api_key" | "oauth"; credential: string } };
  projectId: string;
  stack: string;
}): Promise<string | null> {
  const read = await readAlchemyStack({
    stack: args.stack,
    target: {
      authMethod: args.credential.auth.method,
      teamId: args.convexTeam.teamId,
      token: args.credential.auth.credential,
    },
  });
  const deployed =
    read.store === "found" &&
    readProductionConvexDeployments(read.stages).some(
      (deployment) =>
        deployment.projectId === args.projectId &&
        (deployment.teamId === null || deployment.teamId === args.convexTeam.teamId),
    );
  return deployed ? args.projectId : null;
}

async function readRepositoryDatabaseDeploymentContext(
  ctx: RepositoryDatabaseActionCtx,
  args: {
    owner: string;
    repoName: string;
    branch: string;
    /** An attachment id, or the Convex project id of a deployment of the repository stack. */
    convexProjectId: string;
  },
): Promise<RepositoryDatabaseDeploymentContext> {
  const repository: RepositoryDatabaseLookup = await ctx.runQuery(
    internal.repository.records.getByRepositoryFullName,
    {
      userId: ctx.viewer.userId,
      githubRepositoryFullName: `${args.owner}/${args.repoName}`,
      branch: args.branch,
    },
  );

  if (!repository) {
    return { kind: "missing_repository" };
  }

  const defaultBranch = repository.defaultBranch;
  if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
    return { kind: "missing_repository" };
  }

  if (defaultBranch !== args.branch) {
    return {
      kind: "unsupported_branch",
      defaultBranch,
    };
  }

  const project = await ctx.runQuery(internal.repository.database.readEmbeddedDashboardProject, {
    repositoryId: repository.repositoryId,
    userId: ctx.viewer.userId,
    convexProjectId: args.convexProjectId,
  });

  if (!project) {
    return { kind: "missing_deployment" };
  }

  const connection = await ctx.runQuery(
    internal.organizationProviderCredentials.loadConvexForOrganizationTeam,
    {
      userId: ctx.viewer.userId,
      organizationId: repository.organizationId,
      teamId: project.teamId,
    },
  );
  const credential = connection?.credential;
  if (!connection || !credential || connection.teamId !== project.teamId) {
    return { kind: "missing_connection" };
  }
  const projectId =
    project.source === "attachment"
      ? project.projectId
      : await readStackProjectId({
          convexTeam: connection,
          credential,
          projectId: args.convexProjectId,
          stack: project.stack,
        });
  const deployment = projectId
    ? await readConvexProductionDeployment({ token: credential.auth.credential, projectId })
    : null;
  if (!deployment) {
    return { kind: "missing_deployment" };
  }

  return {
    kind: "ready",
    deployment,
    convexCredential: credential,
  };
}

export const createEmbeddedDashboardCredentials = action({
  access: "access_dashboard",
  args: {
    owner: string(),
    repoName: string(),
    branch: string(),
    /** An attachment id, or the Convex project id of a deployment of the repository stack. */
    convexProjectId: string(),
  },
  returns: embeddedDashboardCredentialsResult,
  handler: async (ctx, args): Promise<EmbeddedDashboardCredentialsResult> => {
    const context = await readRepositoryDatabaseDeploymentContext(ctx, args);
    if (context.kind !== "ready") {
      return context;
    }
    // Convex ignores allowedActions and expiresAt for OAuth connections and returns the team-wide
    // OAuth token as the deploy key. This action sends the key to the browser, so OAuth stops here.
    if (context.convexCredential.auth.method === "oauth") {
      return { kind: "oauth_connection" };
    }

    const expiresAt = Date.now() + EMBEDDED_DASHBOARD_DEPLOY_KEY_TTL_MS;
    const deployKeyName = buildEmbeddedDashboardDeployKeyName({
      deploymentName: context.deployment.name,
      expiresAt,
    });
    const deployKey = await createConvexDeploymentDeployKey({
      allowedActions: EMBEDDED_DASHBOARD_ALLOWED_ACTIONS,
      authMethod: context.convexCredential.auth.method,
      deploymentName: context.deployment.name,
      expiresAt,
      name: deployKeyName,
      token: context.convexCredential.auth.credential,
    });

    return {
      kind: "ready",
      deploymentUrl: context.deployment.deploymentUrl,
      deploymentName: context.deployment.name,
      deployKeyName,
      adminKey: deployKey,
    };
  },
});

export const revokeEmbeddedDashboardCredentials = action({
  access: "access_dashboard",
  args: {
    owner: string(),
    repoName: string(),
    branch: string(),
    /** An attachment id, or the Convex project id of a deployment of the repository stack. */
    convexProjectId: string(),
    deployKeyName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await readRepositoryDatabaseDeploymentContext(ctx, args);
    // OAuth connections never mint embedded keys, so there is nothing to revoke.
    if (
      context.kind !== "ready" ||
      context.convexCredential.auth.method !== "api_key" ||
      !isEmbeddedDashboardDeployKeyName({
        deploymentName: context.deployment.name,
        deployKeyName: args.deployKeyName,
      })
    ) {
      return null;
    }

    await deleteConvexDeploymentDeployKey({
      deploymentName: context.deployment.name,
      name: args.deployKeyName,
      token: context.convexCredential.auth.credential,
    });
    return null;
  },
});
