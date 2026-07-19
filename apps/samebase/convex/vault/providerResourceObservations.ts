"use node";

import { v, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import { action, type AuthenticatedAppViewer } from "../functions";
import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { isConvexCloudDeployment, requestConvexManagementApi } from "../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import {
  readOptionalWorkersDevUrl,
  observeCloudflareWorkerInfrastructure,
} from "../cloudflareResources";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import { buildVaultCloudflareBuildConfigForAppRoot } from "./model";
import {
  type CloudflareWorkerObservation,
  type ConvexDeploymentObservation,
  vCloudflareWorkerObservation,
  vConvexDeploymentObservation,
} from "./providerResourceObservationModel";
import type { ProviderResourceObservationTarget } from "./providerResourceObservationTargets";

const { array, id, object, string } = v;

const observedConvexDeployment = object({
  appRoot: string(),
  projectId: string(),
  deploymentName: string(),
  observation: vConvexDeploymentObservation,
});
const observedCloudflareWorker = object({
  appRoot: string(),
  accountId: string(),
  workerName: string(),
  workerTag: string(),
  observation: vCloudflareWorkerObservation,
});
const vaultProviderResourceObservations = object({
  vaultId: id("vaults"),
  convexDeployments: array(observedConvexDeployment),
  cloudflareWorkers: array(observedCloudflareWorker),
});
type ObservedConvexDeployment = Infer<typeof observedConvexDeployment>;
type ObservedCloudflareWorker = Infer<typeof observedCloudflareWorker>;
type VaultProviderResourceObservations = Infer<typeof vaultProviderResourceObservations>;
type CloudflareObservationConnection = {
  auth: {
    method: "api_key" | "oauth" | "mcp_oauth";
    credential: string;
  };
};

type ProviderResourceObservationActionCtx = Pick<ActionCtx, "runAction" | "runQuery"> & {
  viewer: AuthenticatedAppViewer;
};
function buildConvexProjectSettingsDashboardUrl(args: {
  projectSlug: string;
  teamSlug: string;
}): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(args.teamSlug)}/${encodeURIComponent(args.projectSlug)}/settings`;
}

function buildConvexDeploymentDashboardUrl(args: {
  deploymentName: string;
  projectSlug: string;
  teamSlug: string;
}): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(args.teamSlug)}/${encodeURIComponent(args.projectSlug)}/${encodeURIComponent(args.deploymentName)}`;
}

async function observeConvexDeployment(args: {
  convexToken: string;
  convexTeamId: string;
  projectId: string;
  deploymentName: string;
}): Promise<ConvexDeploymentObservation> {
  const observedAt = Date.now();
  try {
    const [project, deployment] = await Promise.all([
      requestConvexManagementApi(args.convexToken, "GET", "/projects/{project_id}", {
        params: { path: { project_id: args.projectId } },
      }),
      requestConvexManagementApi(args.convexToken, "GET", "/deployments/{deployment_name}", {
        params: { path: { deployment_name: args.deploymentName } },
      }),
    ]);
    if (
      project.id !== args.projectId ||
      project.teamId !== args.convexTeamId ||
      !isConvexCloudDeployment(deployment) ||
      deployment.projectId !== args.projectId ||
      deployment.name !== args.deploymentName
    ) {
      return { state: "missing", observedAt };
    }
    return {
      state: "available",
      observedAt,
      projectSlug: project.slug,
      teamSlug: project.teamSlug,
      cloudUrl: deployment.deploymentUrl,
      siteUrl: `https://${deployment.name}.convex.site`,
      projectSettingsDashboardUrl: buildConvexProjectSettingsDashboardUrl({
        projectSlug: project.slug,
        teamSlug: project.teamSlug,
      }),
      deploymentDashboardUrl: buildConvexDeploymentDashboardUrl({
        deploymentName: deployment.name,
        projectSlug: project.slug,
        teamSlug: project.teamSlug,
      }),
    };
  } catch (error) {
    return isConvexManagementNotFoundError(error)
      ? { state: "missing", observedAt }
      : { state: "failed", observedAt, reason: "provider_failure" };
  }
}

async function observeConvexDeployments(
  ctx: ProviderResourceObservationActionCtx,
  target: ProviderResourceObservationTarget,
): Promise<ObservedConvexDeployment[]> {
  if (target.convexDeployments.length === 0) {
    return [];
  }
  const connection: Doc<"providerConnections"> | null = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId: ctx.viewer.userId,
      kind: "convex",
    },
  );
  const convexToken = connection?.kind === "convex" ? connection.auth.credential.trim() : "";
  const convexTeamId = connection?.kind === "convex" ? connection.teamId.trim() : "";
  if (!convexToken || !convexTeamId) {
    const observedAt = Date.now();
    return target.convexDeployments.map(({ appRoot, projectId, deploymentName }) => ({
      appRoot,
      projectId,
      deploymentName,
      observation: {
        state: "failed" as const,
        observedAt,
        reason: "connection_required" as const,
      },
    }));
  }
  return await Promise.all(
    target.convexDeployments.map(async ({ appRoot, projectId, deploymentName }) => ({
      appRoot,
      projectId,
      deploymentName,
      observation: await observeConvexDeployment({
        convexToken,
        convexTeamId,
        projectId,
        deploymentName,
      }),
    })),
  );
}

async function observeCloudflareWorkers(args: {
  ctx: ProviderResourceObservationActionCtx;
  target: ProviderResourceObservationTarget;
  convexDeployments: Awaited<ReturnType<typeof observeConvexDeployments>>;
}): Promise<ObservedCloudflareWorker[]> {
  if (args.target.cloudflareWorkers.length === 0) {
    return [];
  }
  const connection: CloudflareObservationConnection | null = await args.ctx.runAction(
    internal.cloudflareOAuth.resolveConnectionForUser,
    {
      userId: args.ctx.viewer.userId,
    },
  );
  const token = connection?.auth.credential.trim();
  if (!connection || !token) {
    const observedAt = Date.now();
    return args.target.cloudflareWorkers.map(({ appRoot, accountId, workerName, workerTag }) => ({
      appRoot,
      accountId,
      workerName,
      workerTag,
      observation: {
        state: "failed" as const,
        observedAt,
        reason: "connection_required" as const,
      },
    }));
  }

  return await Promise.all(
    args.target.cloudflareWorkers.map(async ({ appRoot, accountId, workerName, workerTag }) => {
      const observedAt = Date.now();
      const convexAvailable = args.convexDeployments.some(
        (deployment) =>
          deployment.appRoot === appRoot && deployment.observation.state === "available",
      );
      try {
        const buildConfig = buildVaultCloudflareBuildConfigForAppRoot({ appRoot });
        const [providerResult, workersDevUrl] = await Promise.all([
          observeCloudflareWorkerInfrastructure({
            vaultId: args.target.vaultId,
            workerName,
            workerTag,
            cloudflareToken: token,
            cloudflareAuthMethod: connection.auth.method,
            accountId,
            defaultBranch: args.target.defaultBranch,
            expectedRepoId: args.target.ghRepoId,
            build: { state: "not_connected" },
            buildConfig: {
              rootDir: buildConfig.rootDirectory,
              buildCommand: buildConfig.buildCommand,
              deployCommand: buildConfig.deployCommand,
              previewDeployCommand: buildConfig.previewDeployCommand,
              pathIncludes: buildConfig.pathIncludes,
              pathExcludes: buildConfig.pathExcludes,
            },
            verifyConvexBuildAccess: convexAvailable,
          }),
          readOptionalWorkersDevUrl({
            token,
            accountId,
            workerName,
            transport: resolveCloudflareApiTransport(connection.auth.method),
          }),
        ]);
        let observation: CloudflareWorkerObservation;
        if (providerResult.worker === "missing_upstream") {
          observation = { state: "missing", observedAt };
        } else {
          const buildsConnected = providerResult.builds === "adopted";
          observation = {
            state: "available",
            observedAt,
            ...(workersDevUrl ? { workersDevUrl } : {}),
            githubRepositoryConnection: buildsConnected ? "connected" : "not_connected",
            convexDeployKeys:
              !convexAvailable || !buildsConnected
                ? "not_applicable"
                : providerResult.convexBuildAccess === "confirmed"
                  ? "set"
                  : "missing",
          };
        }
        return { appRoot, accountId, workerName, workerTag, observation };
      } catch {
        return {
          appRoot,
          accountId,
          workerName,
          workerTag,
          observation: {
            state: "failed" as const,
            observedAt,
            reason: "provider_failure" as const,
          },
        };
      }
    }),
  );
}

export const observeVaultProviderResources = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
  },
  returns: vaultProviderResourceObservations,
  handler: async (ctx, args): Promise<VaultProviderResourceObservations> => {
    const target: ProviderResourceObservationTarget | null = await ctx.runQuery(
      internal.vault.providerResourceObservationTargets.read,
      {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      },
    );
    if (!target) {
      throw new Error("Vault not found.");
    }
    const convexDeployments = await observeConvexDeployments(ctx, target);
    const cloudflareWorkers = await observeCloudflareWorkers({
      ctx,
      target,
      convexDeployments,
    });
    return {
      vaultId: target.vaultId,
      convexDeployments,
      cloudflareWorkers,
    };
  },
});
