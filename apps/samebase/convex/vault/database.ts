import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type ActionCtx } from "../_generated/server";
import { action } from "../functions";
import type { AuthenticatedAppViewer } from "../functions";
import {
  hasVaultChildOrganizationAccess,
  requireOrganizationAccessContext,
} from "../organizationAccess";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  createConvexDeploymentDeployKey,
  deleteConvexDeploymentDeployKey,
  type ConvexDeployKeyAllowedAction,
} from "./convexDeployKeys";
import { readConvexProductionDeployment } from "./convexProjectResources";
import { isLiveConnectedVault } from "./state";

const { id, literal, null: nullValue, object, string, union } = v;

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
    kind: literal("missing_vault"),
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
type VaultDatabaseLookup = {
  _id: Id<"vaults">;
  defaultBranch: string | undefined;
} | null;
type VaultDatabaseActionCtx = Pick<ActionCtx, "runQuery"> & {
  viewer: AuthenticatedAppViewer;
};
type ReadyVaultDatabaseDeploymentContext = {
  kind: "ready";
  deployment: ConvexCloudDeployment;
  convexConnection: Extract<Doc<"providerConnections">, { kind: "convex" }>;
};
type VaultDatabaseDeploymentContext =
  | ReadyVaultDatabaseDeploymentContext
  | Exclude<EmbeddedDashboardCredentialsResult, { kind: "ready" }>;

export const readEmbeddedDashboardProject = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    convexProjectId: id("vaultConvexProjects"),
  },
  returns: union(
    object({
      teamId: string(),
      projectId: string(),
    }),
    nullValue(),
  ),
  handler: async (ctx, args) => {
    const [vault, project] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db.get(args.convexProjectId),
    ]);
    const ownership = await requireOrganizationAccessContext(ctx.db, args.userId);
    if (
      !isLiveConnectedVault(vault) ||
      !project ||
      !hasVaultChildOrganizationAccess(ownership, vault, project)
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

async function readVaultDatabaseDeploymentContext(
  ctx: VaultDatabaseActionCtx,
  args: {
    owner: string;
    repoName: string;
    branch: string;
    convexProjectId: Id<"vaultConvexProjects">;
  },
): Promise<VaultDatabaseDeploymentContext> {
  const vault: VaultDatabaseLookup = await ctx.runQuery(
    internal.vault.records.getByRepositoryFullName,
    {
      userId: ctx.viewer.userId,
      repositoryFullName: `${args.owner}/${args.repoName}`,
      branch: args.branch,
    },
  );

  if (!vault) {
    return { kind: "missing_vault" };
  }

  const defaultBranch = vault.defaultBranch;
  if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
    return { kind: "missing_vault" };
  }

  if (defaultBranch !== args.branch) {
    return {
      kind: "unsupported_branch",
      defaultBranch,
    };
  }

  const [project, connection] = await Promise.all([
    ctx.runQuery(internal.vault.database.readEmbeddedDashboardProject, {
      vaultId: vault._id,
      userId: ctx.viewer.userId,
      convexProjectId: args.convexProjectId,
    }),
    ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "convex",
    }),
  ]);

  if (!project) {
    return { kind: "missing_deployment" };
  }

  if (!connection || connection.kind !== "convex") {
    return { kind: "missing_connection" };
  }
  if (connection.teamId !== project.teamId) {
    return { kind: "missing_connection" };
  }
  const deployment = await readConvexProductionDeployment({
    token: connection.auth.credential,
    projectId: project.projectId,
  });
  if (!deployment) {
    return { kind: "missing_deployment" };
  }

  return {
    kind: "ready",
    deployment,
    convexConnection: connection,
  };
}

export const createEmbeddedDashboardCredentials = action({
  access: "access_dashboard",
  args: {
    owner: string(),
    repoName: string(),
    branch: string(),
    convexProjectId: v.id("vaultConvexProjects"),
  },
  returns: embeddedDashboardCredentialsResult,
  handler: async (ctx, args): Promise<EmbeddedDashboardCredentialsResult> => {
    const context = await readVaultDatabaseDeploymentContext(ctx, args);
    if (context.kind !== "ready") {
      return context;
    }

    const expiresAt = Date.now() + EMBEDDED_DASHBOARD_DEPLOY_KEY_TTL_MS;
    const deployKeyName = buildEmbeddedDashboardDeployKeyName({
      deploymentName: context.deployment.name,
      expiresAt,
    });
    const deployKey = await createConvexDeploymentDeployKey({
      allowedActions: EMBEDDED_DASHBOARD_ALLOWED_ACTIONS,
      authMethod: context.convexConnection.auth.method,
      deploymentName: context.deployment.name,
      expiresAt,
      name: deployKeyName,
      token: context.convexConnection.auth.credential,
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
    convexProjectId: v.id("vaultConvexProjects"),
    deployKeyName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const context = await readVaultDatabaseDeploymentContext(ctx, args);
    if (
      context.kind !== "ready" ||
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
      token: context.convexConnection.auth.credential,
    });

    return null;
  },
});
