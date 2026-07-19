"use node";

import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  readCloudflareWorkerIdentity,
  readCloudflareWorkerDeploymentDiscoveryForIdentity,
  readCloudflareWorkersDevAvailability,
  type CloudflareConvexBuildAccessObservation,
} from "../cloudflareResources";
import { vCloudflareWorkerRepositoryEvidence } from "./contracts/cloudflareListWorkers";
import {
  buildConvexSiteUrl,
  readConvexProductionDeployment,
  readConvexProjectResource,
} from "./convexProjectResources";
import type { VaultProviderObservationContext } from "./providerObservationQueries";
import { buildVaultCloudflareBuildConfigForRootDirectory } from "./model";

const { array, id, literal, number, object, string, union } = v;

const vObservationFailureReason = union(literal("connection_required"), literal("request_failed"));
const vCloudflareRepositoryDiscovery = object({
  classification: union(
    literal("recommended"),
    literal("available"),
    literal("blocked"),
    literal("unknown"),
  ),
  evidence: vCloudflareWorkerRepositoryEvidence,
});
const vObservedConvexProject = union(
  object({
    state: literal("attached"),
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    projectId: string(),
  }),
  object({
    state: literal("external"),
    teamId: string(),
    projectId: string(),
  }),
);
const vCloudflareConvexBuildAccess = union(
  object({ state: literal("not_configured") }),
  object({ state: literal("configured"), convexProject: vObservedConvexProject }),
  object({ state: literal("incomplete"), convexProject: vObservedConvexProject }),
  object({ state: literal("target_unknown") }),
  object({ state: literal("inconsistent") }),
  object({ state: literal("invalid") }),
);
const vCloudflareBuildsObservation = union(
  object({ state: literal("not_connected") }),
  object({ state: literal("connected"), convexBuildAccess: vCloudflareConvexBuildAccess }),
);
const vWorkersDevObservation = union(
  object({ state: literal("enabled"), url: string() }),
  object({ state: literal("disabled") }),
  object({ state: literal("failed"), reason: vObservationFailureReason }),
);
const vCloudflareWorkerObservation = union(
  object({
    state: literal("available"),
    observedAt: number(),
    workerId: id("vaultCloudflareWorkers"),
    workerTag: string(),
    workersDev: vWorkersDevObservation,
    repository: vCloudflareRepositoryDiscovery,
    builds: vCloudflareBuildsObservation,
  }),
  object({
    state: literal("missing"),
    observedAt: number(),
    workerId: id("vaultCloudflareWorkers"),
  }),
  object({
    state: literal("failed"),
    observedAt: number(),
    workerId: id("vaultCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vConvexProductionDeploymentObservation = union(
  object({
    state: literal("available"),
    deploymentName: string(),
    cloudUrl: string(),
    siteUrl: string(),
  }),
  object({ state: literal("missing") }),
);
const vConvexProjectObservation = union(
  object({
    state: literal("available"),
    observedAt: number(),
    convexProjectId: id("vaultConvexProjects"),
    projectName: string(),
    projectSlug: string(),
    teamSlug: string(),
    productionDeployment: vConvexProductionDeploymentObservation,
  }),
  object({
    state: literal("missing"),
    observedAt: number(),
    convexProjectId: id("vaultConvexProjects"),
  }),
  object({
    state: literal("failed"),
    observedAt: number(),
    convexProjectId: id("vaultConvexProjects"),
    reason: vObservationFailureReason,
  }),
);
type CloudflareWorkerObservation = Infer<typeof vCloudflareWorkerObservation>;
type ConvexProjectObservation = Infer<typeof vConvexProjectObservation>;

function resolveObservedConvexBuildAccess(
  observation: CloudflareConvexBuildAccessObservation,
  projects: VaultProviderObservationContext["convexProjects"],
) {
  switch (observation.state) {
    case "configured":
    case "incomplete": {
      const attached = projects.find(
        (project) =>
          project.teamId === observation.convexProject.teamId &&
          project.projectId === observation.convexProject.projectId,
      );
      return {
        state: observation.state,
        convexProject: attached
          ? {
              state: "attached" as const,
              convexProjectId: attached.convexProjectId,
              teamId: attached.teamId,
              projectId: attached.projectId,
            }
          : { state: "external" as const, ...observation.convexProject },
      };
    }
    case "not_configured":
    case "target_unknown":
    case "inconsistent":
    case "invalid":
      return observation;
  }
  observation satisfies never;
  return observation;
}

async function readObservationContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
): Promise<VaultProviderObservationContext> {
  return await ctx.runQuery(
    internal.vault.providerObservationQueries.readVaultProviderObservationContext,
    args,
  );
}

export const observeCloudflareWorkers = action({
  access: "access_dashboard",
  args: { vaultId: id("vaults") },
  returns: array(vCloudflareWorkerObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerObservation[]> => {
    const context = await readObservationContext(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    const connectionResolution = await ctx
      .runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
        userId: ctx.viewer.userId,
      })
      .then(
        (connection) => ({ state: "available" as const, connection }),
        () => ({ state: "failed" as const }),
      );
    if (connectionResolution.state === "failed") {
      const observedAt = Date.now();
      return context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        observedAt,
        workerId: worker.workerId,
        reason: "request_failed" as const,
      }));
    }
    const connection = connectionResolution.connection;
    const token = connection?.auth.credential.trim();
    if (!connection || !token) {
      const observedAt = Date.now();
      return context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        observedAt,
        workerId: worker.workerId,
        reason: "connection_required" as const,
      }));
    }
    const transport = resolveCloudflareApiTransport(connection.auth.method);

    return await Promise.all(
      context.cloudflareWorkers.map(async (worker) => {
        try {
          const identity = await readCloudflareWorkerIdentity({
            token,
            transport,
            accountId: worker.accountId,
            workerName: worker.workerName,
          });
          const observedAt = Date.now();
          if (!identity || identity.workerTag !== worker.workerTag) {
            return {
              state: "missing" as const,
              observedAt,
              workerId: worker.workerId,
            };
          }
          const config = buildVaultCloudflareBuildConfigForRootDirectory({
            rootDirectory: worker.rootDirectory,
          });
          const [workersDev, deployment] = await Promise.all([
            readCloudflareWorkersDevAvailability({
              token,
              transport,
              accountId: worker.accountId,
              workerName: worker.workerName,
            }).catch(() => ({ state: "failed" as const, reason: "request_failed" as const })),
            readCloudflareWorkerDeploymentDiscoveryForIdentity({
              token,
              transport,
              accountId: worker.accountId,
              workerTag: worker.workerTag,
              defaultBranch: context.defaultBranch,
              expectedRepoId: context.ghRepoId,
              buildConfig: {
                rootDir: config.rootDirectory,
                buildCommand: config.buildCommand,
                deployCommand: config.deployCommand,
                previewDeployCommand: config.previewDeployCommand,
                pathIncludes: config.pathIncludes,
                pathExcludes: config.pathExcludes,
              },
            }),
          ]);
          return {
            state: "available" as const,
            observedAt: Date.now(),
            workerId: worker.workerId,
            workerTag: identity.workerTag,
            workersDev,
            repository: deployment.repository,
            builds:
              deployment.builds.state === "not_connected"
                ? deployment.builds
                : {
                    state: "connected" as const,
                    convexBuildAccess: resolveObservedConvexBuildAccess(
                      deployment.builds.convexBuildAccess,
                      context.convexProjects,
                    ),
                  },
          };
        } catch {
          return {
            state: "failed" as const,
            observedAt: Date.now(),
            workerId: worker.workerId,
            reason: "request_failed" as const,
          };
        }
      }),
    );
  },
});

export const observeConvexProjects = action({
  access: "access_dashboard",
  args: { vaultId: id("vaults") },
  returns: array(vConvexProjectObservation),
  handler: async (ctx, args): Promise<ConvexProjectObservation[]> => {
    const context = await readObservationContext(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "convex",
    });
    const token = connection?.kind === "convex" ? connection.auth.credential.trim() : "";
    if (!token) {
      const observedAt = Date.now();
      return context.convexProjects.map((project) => ({
        state: "failed" as const,
        observedAt,
        convexProjectId: project.convexProjectId,
        reason: "connection_required" as const,
      }));
    }

    return await Promise.all(
      context.convexProjects.map(async (project) => {
        try {
          const details = await readConvexProjectResource({
            token,
            teamId: project.teamId,
            projectId: project.projectId,
          });
          const observedAt = Date.now();
          if (!details) {
            return {
              state: "missing" as const,
              observedAt,
              convexProjectId: project.convexProjectId,
            };
          }
          const deployment = await readConvexProductionDeployment({
            token,
            projectId: project.projectId,
          });
          return {
            state: "available" as const,
            observedAt: Date.now(),
            convexProjectId: project.convexProjectId,
            projectName: details.name,
            projectSlug: details.slug,
            teamSlug: details.teamSlug,
            productionDeployment: deployment
              ? {
                  state: "available" as const,
                  deploymentName: deployment.name,
                  cloudUrl: deployment.deploymentUrl,
                  siteUrl: buildConvexSiteUrl(deployment),
                }
              : { state: "missing" as const },
          };
        } catch {
          return {
            state: "failed" as const,
            observedAt: Date.now(),
            convexProjectId: project.convexProjectId,
            reason: "request_failed" as const,
          };
        }
      }),
    );
  },
});
