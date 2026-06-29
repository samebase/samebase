import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../functions";
import type { AuthenticatedAppViewer } from "../functions";
import { requestConvexManagementApi } from "../convexManagementApi/client";
import type { components } from "../convexManagementApi/types.generated";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";

const { literal, null: nullValue, object, string, union } = v;

type ConvexDeployKeyAllowedAction = NonNullable<
  components["schemas"]["PlatformCreateDeployKeyArgs"]["allowedActions"]
>[number];

const EMBEDDED_DASHBOARD_DEPLOY_KEY_TTL_MS = 60 * 60 * 1000;
const EMBEDDED_DASHBOARD_ALLOWED_ACTIONS = [
  "deployment:data:view",
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
type VaultDatabaseReadContext = {
  convexDeployments: Doc<"vaultConvexDeployments">[];
  convexConnection: Extract<Doc<"providerConnections">, { kind: "convex" }> | null;
};
type VaultDatabaseActionCtx = Pick<ActionCtx, "runQuery"> & {
  viewer: AuthenticatedAppViewer;
};
type ReadyVaultDatabaseDeploymentContext = {
  kind: "ready";
  deployment: Doc<"vaultConvexDeployments">;
  convexConnection: Extract<Doc<"providerConnections">, { kind: "convex" }>;
};
type VaultDatabaseDeploymentContext =
  | ReadyVaultDatabaseDeploymentContext
  | Exclude<EmbeddedDashboardCredentialsResult, { kind: "ready" }>;

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
    appRoot: string;
  },
): Promise<VaultDatabaseDeploymentContext> {
  const appRoot = normalizeVaultAppRoot(args.appRoot);
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

  const vaultContext: VaultDatabaseReadContext = await ctx.runQuery(
    internal.infraReadQueries.getVaultReadContext,
    {
      vaultId: vault._id,
    },
  );
  const deployment = vaultContext.convexDeployments.find(
    (candidate) => candidate.appRoot === appRoot,
  );

  if (!deployment) {
    return { kind: "missing_deployment" };
  }

  const convexConnection = vaultContext.convexConnection;
  if (!convexConnection) {
    return { kind: "missing_connection" };
  }

  return {
    kind: "ready",
    deployment,
    convexConnection,
  };
}

export const createEmbeddedDashboardCredentials = action({
  access: "access_files_read",
  args: {
    owner: string(),
    repoName: string(),
    branch: string(),
    appRoot: string(),
  },
  returns: embeddedDashboardCredentialsResult,
  handler: async (ctx, args): Promise<EmbeddedDashboardCredentialsResult> => {
    const context = await readVaultDatabaseDeploymentContext(ctx, args);
    if (context.kind !== "ready") {
      return context;
    }

    const expiresAt = Date.now() + EMBEDDED_DASHBOARD_DEPLOY_KEY_TTL_MS;
    const deployKeyName = buildEmbeddedDashboardDeployKeyName({
      deploymentName: context.deployment.deploymentName,
      expiresAt,
    });
    // Convex OAuth deploy keys reuse the OAuth grant, so request-scoped
    // allowedActions are only valid for API-key backed deploy keys.
    const body =
      context.convexConnection.auth.method === "api_key"
        ? {
            allowedActions: EMBEDDED_DASHBOARD_ALLOWED_ACTIONS,
            expiresAt,
            name: deployKeyName,
          }
        : {
            expiresAt,
            name: deployKeyName,
          };
    const { deployKey } = await requestConvexManagementApi(
      context.convexConnection.auth.credential,
      "POST",
      "/deployments/{deployment_name}/create_deploy_key",
      {
        params: { path: { deployment_name: context.deployment.deploymentName } },
        body,
      },
    );

    return {
      kind: "ready",
      deploymentUrl: context.deployment.cloudUrl,
      deploymentName: context.deployment.deploymentName,
      deployKeyName,
      adminKey: deployKey,
    };
  },
});

export const revokeEmbeddedDashboardCredentials = action({
  access: "access_files_read",
  args: {
    owner: string(),
    repoName: string(),
    branch: string(),
    appRoot: string(),
    deployKeyName: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const context = await readVaultDatabaseDeploymentContext(ctx, args);
    if (
      context.kind !== "ready" ||
      !isEmbeddedDashboardDeployKeyName({
        deploymentName: context.deployment.deploymentName,
        deployKeyName: args.deployKeyName,
      })
    ) {
      return null;
    }

    await requestConvexManagementApi(
      context.convexConnection.auth.credential,
      "POST",
      "/deployments/{deployment_name}/delete_deploy_key",
      {
        params: { path: { deployment_name: context.deployment.deploymentName } },
        body: { id: args.deployKeyName },
      },
    );

    return null;
  },
});
