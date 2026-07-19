"use node";

import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  readCloudflareWorkerIdentity,
  readCloudflareWorkerRepositoryDiscoveryForIdentity,
  readCloudflareWorkersDevAvailability,
} from "../cloudflareResources";
import { vCloudflareWorkerRepositoryEvidence } from "./contracts/cloudflareListWorkers";
import {
  buildConvexSiteUrl,
  readConvexProductionDeployment,
  readConvexProjectResource,
} from "./convexProjectResources";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

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
          const [workersDev, repository] = await Promise.all([
            readCloudflareWorkersDevAvailability({
              token,
              transport,
              accountId: worker.accountId,
              workerName: worker.workerName,
            }).catch(() => ({ state: "failed" as const, reason: "request_failed" as const })),
            readCloudflareWorkerRepositoryDiscoveryForIdentity({
              token,
              transport,
              accountId: worker.accountId,
              workerName: worker.workerName,
              workerTag: worker.workerTag,
              expectedRepoId: context.ghRepoId,
              expectedRootDirectory: worker.rootDirectory,
            }),
          ]);
          return {
            state: "available" as const,
            observedAt: Date.now(),
            workerId: worker.workerId,
            workerTag: identity.workerTag,
            workersDev,
            repository,
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
