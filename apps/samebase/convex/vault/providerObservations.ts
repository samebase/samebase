"use node";

import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerBuildsPage,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentity,
  readCloudflareWorkersDevSubdomain,
  type CloudflareConvexBuildAccessObservation,
} from "../cloudflareResources";
import { requestConvexManagementApi } from "../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import { fetchGitHubConvexCodeLocationDiscovery, fetchGitHubRepoIdentity } from "../githubRepoApi";
import { vCloudflareWorkerRepositoryDiscovery } from "./contracts/cloudflareAttachments";
import { vConvexCodeLocation } from "./contracts/convexAttachments";
import { buildConvexSiteUrl, readConvexProductionDeployment } from "./convexProjectResources";
import { matchLatestCloudflareWorkerBuildForBranch } from "./cloudflareBuildMatching";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

const { array, id, literal, number, object, string, union } = v;

const vObservationFailureReason = union(literal("connection_required"), literal("request_failed"));
const vCloudflareBuildState = union(
  literal("queued"),
  literal("running"),
  literal("success"),
  literal("failure"),
  literal("cancelled"),
  literal("skipped"),
  literal("unknown"),
);
const vCloudflareProductionBuildObservation = union(
  object({
    state: literal("available"),
    uuid: string(),
    buildState: vCloudflareBuildState,
  }),
  object({ state: literal("absent") }),
  object({ state: literal("unavailable") }),
);
const vObservedConvexProject = union(
  object({
    state: literal("attached"),
    convexProjectId: id("vaultConvexProjects"),
    teamId: string(),
    attachedTeamId: string(),
    teamState: union(literal("matches"), literal("differs")),
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
    customDomains: array(string()),
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
    repository: vCloudflareWorkerRepositoryDiscovery,
    builds: vCloudflareBuildsObservation,
    productionBuild: vCloudflareProductionBuildObservation,
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
const vConvexCodeLocationObservation = union(
  object({
    state: literal("valid"),
    kind: literal("config"),
    blobSha: string(),
  }),
  object({
    state: literal("valid"),
    kind: literal("directory"),
    convexDirectoryTreeSha: string(),
    packageJsonBlobSha: string(),
  }),
  object({ state: literal("missing") }),
  object({ state: literal("unavailable_partial") }),
  object({ state: literal("unavailable"), reason: vObservationFailureReason }),
);
const vConvexProviderProjectDetails = {
  projectName: string(),
  projectSlug: string(),
  teamSlug: string(),
  productionDeployment: vConvexProductionDeploymentObservation,
};
const vConvexProjectProviderObservation = union(
  object({
    state: literal("current"),
    teamId: string(),
    ...vConvexProviderProjectDetails,
  }),
  object({
    state: literal("moved"),
    previousTeamId: string(),
    currentTeamId: string(),
    ...vConvexProviderProjectDetails,
  }),
  object({
    state: literal("missing_ambiguous"),
    teamId: string(),
  }),
  object({
    state: literal("unavailable"),
    reason: vObservationFailureReason,
  }),
);
const vConvexProjectObservation = object({
  observedAt: number(),
  convexProjectId: id("vaultConvexProjects"),
  projectId: string(),
  codeLocation: vConvexCodeLocation,
  source: vConvexCodeLocationObservation,
  provider: vConvexProjectProviderObservation,
});
type CloudflareWorkerObservation = Infer<typeof vCloudflareWorkerObservation>;
type CloudflareWorkerBuildsObservation = Infer<typeof vCloudflareWorkerBuildsObservation>;
type CloudflareWorkerConvexBuildAccessObservation = Infer<
  typeof vCloudflareWorkerConvexBuildAccessObservation
>;
type ConvexProjectObservation = Infer<typeof vConvexProjectObservation>;
type ConvexCodeLocationObservation = ConvexProjectObservation["source"];
type ConvexProjectProviderObservation = ConvexProjectObservation["provider"];

function resolveObservedConvexBuildAccess(
  observation: CloudflareConvexBuildAccessObservation,
  projects: VaultProviderObservationContext["convexProjects"],
) {
  switch (observation.state) {
    case "configured":
    case "incomplete": {
      const attached = projects.find(
        (project) => project.projectId === observation.convexProject.projectId,
      );
      return {
        state: observation.state,
        convexProject: attached
          ? {
              state: "attached" as const,
              convexProjectId: attached.convexProjectId,
              teamId: observation.convexProject.teamId,
              attachedTeamId: attached.teamId,
              teamState:
                attached.teamId === observation.convexProject.teamId
                  ? ("matches" as const)
                  : ("differs" as const),
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

async function readGitHubAccessToken(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<string | null> {
  const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  const token = connection?.kind === "github" ? connection.auth.credential.trim() : "";
  return token || null;
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
            customDomains: identity.customDomains,
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

    const githubAccessToken = await readGitHubAccessToken(ctx, ctx.viewer.userId);
    if (!githubAccessToken) {
      const observedAt = Date.now();
      return input.context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        observedAt,
        workerId: worker.workerId,
        reason: "connection_required" as const,
      }));
    }
    let defaultBranch: string;
    try {
      const repository = await fetchGitHubRepoIdentity({
        githubAccessToken,
        owner: input.context.owner,
        repo: input.context.name,
        expectedRepoId: input.context.ghRepoId,
      });
      defaultBranch = repository.defaultBranch;
    } catch {
      const observedAt = Date.now();
      return input.context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        observedAt,
        workerId: worker.workerId,
        reason: "request_failed" as const,
      }));
    }

    return await Promise.all(
      input.context.cloudflareWorkers.map(async (worker) => {
        try {
          const discovery = await readCloudflareWorkerBuildsDiscoveryForIdentity({
            token: input.token,
            transport: input.transport,
            accountId: worker.accountId,
            workerTag: worker.workerTag,
            defaultBranch,
            expectedRepoId: input.context.ghRepoId,
          });
          let productionBuild: ReturnType<typeof matchLatestCloudflareWorkerBuildForBranch> = {
            state: "provider_disagreement",
          };
          if (discovery.repository.state === "ready" && discovery.builds.state === "connected") {
            try {
              productionBuild = matchLatestCloudflareWorkerBuildForBranch({
                builds: await readCloudflareWorkerBuildsPage({
                  token: input.token,
                  transport: input.transport,
                  accountId: worker.accountId,
                  workerTag: worker.workerTag,
                  page: 1,
                  perPage: 100,
                }),
                branch: defaultBranch,
                worker: {
                  workerTag: worker.workerTag,
                  rootDirectory: discovery.repository.rootDirectory,
                },
                ghRepoId: input.context.ghRepoId,
                triggerUuid: discovery.builds.productionTriggerUuid,
              });
            } catch {
              productionBuild = { state: "provider_disagreement" };
            }
          }
          return {
            state: "available" as const,
            observedAt: Date.now(),
            workerId: worker.workerId,
            repository: discovery.repository,
            builds: discovery.builds,
            productionBuild:
              productionBuild.state === "available"
                ? {
                    state: "available" as const,
                    uuid: productionBuild.buildUuid,
                    buildState: productionBuild.buildState,
                  }
                : productionBuild.state === "absent"
                  ? { state: "absent" as const }
                  : { state: "unavailable" as const },
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
    const contextArgs = {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    };
    const [context, connection, githubAccessToken] = await Promise.all([
      readObservationContext(ctx, contextArgs),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: ctx.viewer.userId,
        kind: "convex",
      }),
      readGitHubAccessToken(ctx, ctx.viewer.userId),
    ]);
    const token = connection?.kind === "convex" ? connection.auth.credential.trim() : "";
    const teamId = connection?.kind === "convex" ? connection.teamId.trim() : "";

    let sourceResolution:
      | {
          state: "available";
          discovery: Awaited<ReturnType<typeof fetchGitHubConvexCodeLocationDiscovery>>;
        }
      | { state: "unavailable"; reason: "connection_required" | "request_failed" };
    if (!githubAccessToken) {
      sourceResolution = { state: "unavailable", reason: "connection_required" };
    } else {
      try {
        sourceResolution = {
          state: "available",
          discovery: await fetchGitHubConvexCodeLocationDiscovery({
            githubAccessToken,
            owner: context.owner,
            repo: context.name,
            expectedRepoId: context.ghRepoId,
          }),
        };
      } catch {
        sourceResolution = { state: "unavailable", reason: "request_failed" };
      }
    }

    return await Promise.all(
      context.convexProjects.map(async (project) => {
        let source: ConvexCodeLocationObservation;
        if (sourceResolution.state === "unavailable") {
          source = { state: "unavailable", reason: sourceResolution.reason };
        } else {
          const location = sourceResolution.discovery.locations.find((candidate) => {
            switch (project.codeLocation.kind) {
              case "config":
                return (
                  candidate.kind === "config" &&
                  candidate.convexConfigPath === project.codeLocation.convexConfigPath
                );
              case "directory":
                return (
                  candidate.kind === "directory" &&
                  candidate.convexDirectoryPath === project.codeLocation.convexDirectoryPath
                );
              default:
                project.codeLocation satisfies never;
                return false;
            }
          });
          if (location?.kind === "config") {
            source = { state: "valid", kind: "config", blobSha: location.blobSha };
          } else if (location?.kind === "directory") {
            source = {
              state: "valid",
              kind: "directory",
              convexDirectoryTreeSha: location.convexDirectoryTreeSha,
              packageJsonBlobSha: location.packageJsonBlobSha,
            };
          } else {
            source =
              sourceResolution.discovery.completeness === "partial"
                ? { state: "unavailable_partial" }
                : { state: "missing" };
          }
        }

        let provider: ConvexProjectProviderObservation;
        if (!token || !teamId) {
          provider = { state: "unavailable", reason: "connection_required" };
          return {
            observedAt: Date.now(),
            convexProjectId: project.convexProjectId,
            projectId: project.projectId,
            codeLocation: project.codeLocation,
            source,
            provider,
          };
        }

        try {
          const details = await requestConvexManagementApi(token, "GET", "/projects/{project_id}", {
            params: { path: { project_id: project.projectId } },
          });
          if (details.id !== project.projectId || details.teamId !== teamId) {
            throw new Error("Convex returned an inconsistent project identity or team.");
          }
          const deployment = await readConvexProductionDeployment({
            token,
            projectId: project.projectId,
          });
          const providerDetails = {
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
          provider =
            details.teamId === project.teamId
              ? {
                  state: "current",
                  teamId: details.teamId,
                  ...providerDetails,
                }
              : {
                  state: "moved",
                  previousTeamId: project.teamId,
                  currentTeamId: details.teamId,
                  ...providerDetails,
                };
          return {
            observedAt: Date.now(),
            convexProjectId: project.convexProjectId,
            projectId: project.projectId,
            codeLocation: project.codeLocation,
            source,
            provider,
          };
        } catch (error) {
          provider = isConvexManagementNotFoundError(error)
            ? { state: "missing_ambiguous", teamId: project.teamId }
            : { state: "unavailable", reason: "request_failed" };
          return {
            observedAt: Date.now(),
            convexProjectId: project.convexProjectId,
            projectId: project.projectId,
            codeLocation: project.codeLocation,
            source,
            provider,
          };
        }
      }),
    );
  },
});
