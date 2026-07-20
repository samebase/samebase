"use node";

import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentity,
  readCloudflareWorkersDevSubdomain,
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
  object({
    state: literal("connected"),
    productionTriggerUuid: string(),
    previewTriggerUuid: string(),
  }),
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
    workersDev: vWorkersDevObservation,
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
const vCloudflareWorkerBuildsObservation = union(
  object({
    state: literal("available"),
    observedAt: number(),
    workerId: id("vaultCloudflareWorkers"),
    repository: vCloudflareRepositoryDiscovery,
    builds: vCloudflareBuildsObservation,
  }),
  object({
    state: literal("failed"),
    observedAt: number(),
    workerId: id("vaultCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vCloudflareWorkerConvexBuildAccessObservation = union(
  object({
    state: literal("available"),
    observedAt: number(),
    workerId: id("vaultCloudflareWorkers"),
    convexBuildAccess: vCloudflareConvexBuildAccess,
  }),
  object({
    state: literal("failed"),
    observedAt: number(),
    workerId: id("vaultCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vCloudflareWorkerBuildAccessTarget = object({
  workerId: id("vaultCloudflareWorkers"),
  productionTriggerUuid: string(),
  previewTriggerUuid: string(),
});
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
type CloudflareWorkerBuildsObservation = Infer<typeof vCloudflareWorkerBuildsObservation>;
type CloudflareWorkerConvexBuildAccessObservation = Infer<
  typeof vCloudflareWorkerConvexBuildAccessObservation
>;
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

async function readCloudflareObservationInput(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: { vaultId: Id<"vaults">; userId: Id<"users"> },
) {
  const [context, connectionResolution] = await Promise.all([
    readObservationContext(ctx, args),
    ctx
      .runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
        userId: args.userId,
      })
      .then(
        (connection) => ({ state: "available" as const, connection }),
        () => ({ state: "failed" as const }),
      ),
  ]);
  if (connectionResolution.state === "failed") {
    return { state: "failed" as const, context, reason: "request_failed" as const };
  }

  const connection = connectionResolution.connection;
  const token = connection?.auth.credential.trim();
  if (!connection || !token) {
    return { state: "failed" as const, context, reason: "connection_required" as const };
  }

  return {
    state: "available" as const,
    context,
    token,
    transport: resolveCloudflareApiTransport(connection.auth.method),
  };
}

export const observeCloudflareWorkers = action({
  access: "access_dashboard",
  args: { vaultId: id("vaults") },
  returns: array(vCloudflareWorkerObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerObservation[]> => {
    const input = await readCloudflareObservationInput(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    if (input.state === "failed") {
      const observedAt = Date.now();
      return input.context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        observedAt,
        workerId: worker.workerId,
        reason: input.reason,
      }));
    }

    const accountSubdomainRequests = new Map<
      string,
      Promise<
        { state: "available"; subdomain: string } | { state: "failed"; reason: "request_failed" }
      >
    >();
    const readAccountSubdomain = (accountId: string) => {
      const existing = accountSubdomainRequests.get(accountId);
      if (existing) {
        return existing;
      }
      const request = readCloudflareWorkersDevSubdomain({
        token: input.token,
        transport: input.transport,
        accountId,
      }).then(
        (subdomain) => ({ state: "available" as const, subdomain }),
        () => ({ state: "failed" as const, reason: "request_failed" as const }),
      );
      accountSubdomainRequests.set(accountId, request);
      return request;
    };

    return await Promise.all(
      input.context.cloudflareWorkers.map(async (worker) => {
        try {
          const [identity, accountSubdomain] = await Promise.all([
            readCloudflareWorkerIdentity({
              token: input.token,
              transport: input.transport,
              accountId: worker.accountId,
              workerName: worker.workerName,
            }),
            readAccountSubdomain(worker.accountId),
          ]);
          const observedAt = Date.now();
          if (!identity || identity.workerTag !== worker.workerTag) {
            return {
              state: "missing" as const,
              observedAt,
              workerId: worker.workerId,
            };
          }

          const workersDev = !identity.workersDevEnabled
            ? { state: "disabled" as const }
            : accountSubdomain.state === "available"
              ? {
                  state: "enabled" as const,
                  url: `https://${worker.workerName}.${accountSubdomain.subdomain}.workers.dev`,
                }
              : accountSubdomain;
          return {
            state: "available" as const,
            observedAt,
            workerId: worker.workerId,
            workersDev,
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

export const observeCloudflareWorkerBuilds = action({
  access: "access_dashboard",
  args: { vaultId: id("vaults") },
  returns: array(vCloudflareWorkerBuildsObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerBuildsObservation[]> => {
    const input = await readCloudflareObservationInput(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    if (input.state === "failed") {
      const observedAt = Date.now();
      return input.context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        observedAt,
        workerId: worker.workerId,
        reason: input.reason,
      }));
    }

    return await Promise.all(
      input.context.cloudflareWorkers.map(async (worker) => {
        try {
          const config = buildVaultCloudflareBuildConfigForRootDirectory({
            rootDirectory: worker.rootDirectory,
          });
          const discovery = await readCloudflareWorkerBuildsDiscoveryForIdentity({
            token: input.token,
            transport: input.transport,
            accountId: worker.accountId,
            workerTag: worker.workerTag,
            defaultBranch: input.context.defaultBranch,
            expectedRepoId: input.context.ghRepoId,
            buildConfig: {
              rootDir: config.rootDirectory,
              buildCommand: config.buildCommand,
              deployCommand: config.deployCommand,
              previewDeployCommand: config.previewDeployCommand,
              pathIncludes: config.pathIncludes,
              pathExcludes: config.pathExcludes,
            },
          });
          return {
            state: "available" as const,
            observedAt: Date.now(),
            workerId: worker.workerId,
            repository: discovery.repository,
            builds: discovery.builds,
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

export const observeCloudflareWorkerConvexBuildAccess = action({
  access: "access_dashboard",
  args: { vaultId: id("vaults"), targets: array(vCloudflareWorkerBuildAccessTarget) },
  returns: array(vCloudflareWorkerConvexBuildAccessObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerConvexBuildAccessObservation[]> => {
    const input = await readCloudflareObservationInput(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    const targets = [...args.targets].sort((left, right) =>
      left.workerId.localeCompare(right.workerId),
    );
    const workersById = new Map(
      input.context.cloudflareWorkers.map((worker) => [worker.workerId, worker]),
    );
    if (
      targets.length > workersById.size ||
      new Set(targets.map((target) => target.workerId)).size !== targets.length ||
      targets.some((target) => !workersById.has(target.workerId))
    ) {
      throw new Error("Cloudflare Builds targets must belong to this vault.");
    }
    if (input.state === "failed") {
      const observedAt = Date.now();
      return targets.map((target) => ({
        state: "failed" as const,
        observedAt,
        workerId: target.workerId,
        reason: input.reason,
      }));
    }

    return await Promise.all(
      targets.map(async (target) => {
        const worker = workersById.get(target.workerId);
        if (!worker) {
          throw new Error("Cloudflare Worker must belong to this vault.");
        }
        try {
          const observation = await readCloudflareWorkerConvexBuildAccess({
            token: input.token,
            transport: input.transport,
            accountId: worker.accountId,
            productionTriggerUuid: target.productionTriggerUuid,
            previewTriggerUuid: target.previewTriggerUuid,
          });
          return {
            state: "available" as const,
            observedAt: Date.now(),
            workerId: target.workerId,
            convexBuildAccess: resolveObservedConvexBuildAccess(
              observation,
              input.context.convexProjects,
            ),
          };
        } catch {
          return {
            state: "failed" as const,
            observedAt: Date.now(),
            workerId: target.workerId,
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
    const teamId = connection?.kind === "convex" ? connection.teamId.trim() : "";
    if (!token || !teamId) {
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
        if (project.teamId !== teamId) {
          return {
            state: "failed" as const,
            observedAt: Date.now(),
            convexProjectId: project.convexProjectId,
            reason: "connection_required" as const,
          };
        }
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
