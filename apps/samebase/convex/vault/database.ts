import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action } from "../functions";
import { requestConvexManagementApi } from "../convexManagementApi/client";
import type { components } from "../convexManagementApi/types.generated";
import { normalizeVaultAppRoot } from "../../shared/vaultAppRoot";

const { literal, object, string, union } = v;

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

function buildEmbeddedDashboardDeployKeyName(args: {
  deploymentName: string;
  expiresAt: number;
}): string {
  return `samebase-embedded-data-${args.deploymentName}-${args.expiresAt}`;
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

    const expiresAt = Date.now() + EMBEDDED_DASHBOARD_DEPLOY_KEY_TTL_MS;
    const body =
      convexConnection.auth.method === "api_key"
        ? {
            allowedActions: EMBEDDED_DASHBOARD_ALLOWED_ACTIONS,
            expiresAt,
            name: buildEmbeddedDashboardDeployKeyName({
              deploymentName: deployment.deploymentName,
              expiresAt,
            }),
          }
        : {
            expiresAt,
            name: buildEmbeddedDashboardDeployKeyName({
              deploymentName: deployment.deploymentName,
              expiresAt,
            }),
          };
    const { deployKey } = await requestConvexManagementApi(
      convexConnection.auth.credential,
      "POST",
      "/deployments/{deployment_name}/create_deploy_key",
      {
        params: { path: { deployment_name: deployment.deploymentName } },
        body,
      },
    );

    return {
      kind: "ready",
      deploymentUrl: deployment.cloudUrl,
      deploymentName: deployment.deploymentName,
      adminKey: deployKey,
    };
  },
});
