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
import { readConvexProductionDeployment } from "./convexProjectResources";
import { requireRepositoryForUser } from "../organizationAccess";

const { id, literal, object, string, union } = v;

const EMBEDDED_DASHBOARD_DEPLOY_KEY_TTL_MS = 60 * 60 * 1000;
const EMBEDDED_DASHBOARD_CREATE_OPERATION = "embedded_dashboard_credentials_create";
const EMBEDDED_DASHBOARD_REVOKE_OPERATION = "embedded_dashboard_credentials_revoke";
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

export const readEmbeddedDashboardProject = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: union(
    object({
      teamId: string(),
      projectId: string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const [repository, project] = await Promise.all([
      requireRepositoryForUser(ctx.db, args),
      ctx.db.get(args.convexProjectId),
    ]);
    if (
      !project ||
      project.repositoryId !== args.repositoryId ||
      project.organizationId !== repository.organizationId ||
      project.teamId !== repository.convexTeamId
    ) {
      return null;
    }

    return {
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

async function readRepositoryDatabaseDeploymentContext(
  ctx: RepositoryDatabaseActionCtx,
  args: {
    owner: string;
    repoName: string;
    branch: string;
    convexProjectId: Id<"repositoryConvexProjects">;
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
  const deployment = await readConvexProductionDeployment({
    token: credential.auth.credential,
    projectId: project.projectId,
  });
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
    convexProjectId: v.id("repositoryConvexProjects"),
  },
  returns: embeddedDashboardCredentialsResult,
  handler: async (ctx, args): Promise<EmbeddedDashboardCredentialsResult> => {
    const context = await readRepositoryDatabaseDeploymentContext(ctx, args);
    if (context.kind !== "ready") {
      return context;
    }

    const operationId = crypto.randomUUID();
    const lease = await ctx.runMutation(
      internal.repositoryMigration.maintenance.claimOperationLease,
      {
        operationId,
        operationName: EMBEDDED_DASHBOARD_CREATE_OPERATION,
      },
    );
    try {
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
    } finally {
      await ctx.runMutation(internal.repositoryMigration.maintenance.releaseOperationLease, {
        leaseId: lease.leaseId,
        operationId,
        operationName: EMBEDDED_DASHBOARD_CREATE_OPERATION,
      });
    }
  },
});

export const revokeEmbeddedDashboardCredentials = action({
  access: "access_dashboard",
  args: {
    owner: string(),
    repoName: string(),
    branch: string(),
    convexProjectId: v.id("repositoryConvexProjects"),
    deployKeyName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await readRepositoryDatabaseDeploymentContext(ctx, args);
    if (
      context.kind !== "ready" ||
      !isEmbeddedDashboardDeployKeyName({
        deploymentName: context.deployment.name,
        deployKeyName: args.deployKeyName,
      })
    ) {
      return null;
    }

    const operationId = crypto.randomUUID();
    const lease = await ctx.runMutation(
      internal.repositoryMigration.maintenance.claimOperationLease,
      {
        operationId,
        operationName: EMBEDDED_DASHBOARD_REVOKE_OPERATION,
      },
    );
    try {
      await deleteConvexDeploymentDeployKey({
        deploymentName: context.deployment.name,
        name: args.deployKeyName,
        token: context.convexCredential.auth.credential,
      });
      return null;
    } finally {
      await ctx.runMutation(internal.repositoryMigration.maintenance.releaseOperationLease, {
        leaseId: lease.leaseId,
        operationId,
        operationName: EMBEDDED_DASHBOARD_REVOKE_OPERATION,
      });
    }
  },
});
