"use node";

import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { CloudflareApiError, resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  readRecentCloudflareWorkerBuilds,
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentityByTag,
  type CloudflareConvexBuildAccessObservation,
} from "../cloudflareResources";
import { requestConvexManagementApi } from "../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../convexManagementApi/errors";
import { fetchGitHubConvexCodeLocationDiscovery, fetchGitHubRepoIdentity } from "../githubRepoApi";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { vCloudflareWorkerRepositoryDiscovery } from "./contracts/cloudflareAttachments";
import { vConvexCodeLocation } from "./contracts/convexAttachments";
import { readConvexProductionDeployment } from "./convexProjectResources";
import {
  matchLatestCloudflareWorkerBuildForBranch,
  vCloudflareBuildDisagreementReason,
  vCloudflareBuildState,
} from "./cloudflareBuildMatching";
import {
  buildCloudflareBuildLogsUrl,
  buildConvexDeploymentDashboardUrl,
} from "./providerDashboardUrls";
import type { RepositoryProviderObservationContext } from "./providerObservationQueries";
import { vConvexDeploymentRegion } from "../convexDeploymentRegionModel";

const { array, id, literal, object, string, union } = v;

const vObservationFailureReason = union(
  literal("connection_required"),
  literal("response_parse_failed"),
  literal("response_validation_failed"),
  literal("request_failed"),
);
const vCloudflareProductionBuildUnavailableReason = union(
  vCloudflareBuildDisagreementReason,
  literal("build_history_incomplete"),
  literal("response_parse_failed"),
  literal("response_validation_failed"),
  literal("request_failed"),
);
const vCloudflareProductionBuildObservation = union(
  object({
    state: literal("available"),
    buildState: vCloudflareBuildState,
    logsUrl: string(),
  }),
  object({ state: literal("absent") }),
  object({
    state: literal("unavailable"),
    reasons: array(vCloudflareProductionBuildUnavailableReason),
  }),
);
type CloudflareProductionBuildUnavailableReason = Infer<
  typeof vCloudflareProductionBuildUnavailableReason
>;
type CloudflareProductionBuildUnavailableReasons = [
  CloudflareProductionBuildUnavailableReason,
  ...CloudflareProductionBuildUnavailableReason[],
];
const vObservedConvexProject = union(
  object({
    state: literal("attached"),
    convexProjectId: id("repositoryConvexProjects"),
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
    productionBuildTokenUuid: union(string(), v.null()),
    previewBuildTokenUuid: union(string(), v.null()),
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
    workerId: id("repositoryCloudflareWorkers"),
    workerName: string(),
    customDomains: array(string()),
    workersDev: vWorkersDevObservation,
  }),
  object({
    state: literal("missing"),
    workerId: id("repositoryCloudflareWorkers"),
  }),
  object({
    state: literal("failed"),
    workerId: id("repositoryCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vCloudflareWorkerBuildsObservation = union(
  object({
    state: literal("available"),
    workerId: id("repositoryCloudflareWorkers"),
    repository: vCloudflareWorkerRepositoryDiscovery,
    builds: vCloudflareBuildsObservation,
    productionBuild: vCloudflareProductionBuildObservation,
  }),
  object({
    state: literal("failed"),
    workerId: id("repositoryCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vCloudflareWorkerConvexBuildAccessObservation = union(
  object({
    state: literal("available"),
    workerId: id("repositoryCloudflareWorkers"),
    convexBuildAccess: vCloudflareConvexBuildAccess,
  }),
  object({
    state: literal("failed"),
    workerId: id("repositoryCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vCloudflareWorkerBuildAccessTarget = object({
  workerId: id("repositoryCloudflareWorkers"),
  productionTriggerUuid: string(),
  previewTriggerUuid: string(),
});
const vConvexProductionDeploymentObservation = union(
  object({
    state: literal("available"),
    deploymentName: string(),
    dashboardUrl: string(),
    region: vConvexDeploymentRegion,
  }),
  object({ state: literal("missing") }),
);
const vConvexCodeLocationObservation = union(
  object({
    state: literal("valid"),
    kind: literal("config"),
  }),
  object({
    state: literal("valid"),
    kind: literal("directory"),
  }),
  object({ state: literal("missing") }),
  object({ state: literal("unavailable_partial") }),
  object({ state: literal("unavailable"), reason: vObservationFailureReason }),
);
const vConvexProviderProjectDetails = {
  projectSlug: string(),
  teamSlug: string(),
  productionDeployment: vConvexProductionDeploymentObservation,
};
const vConvexProjectProviderObservation = union(
  object({
    state: literal("current"),
    ...vConvexProviderProjectDetails,
  }),
  object({ state: literal("missing_ambiguous") }),
  object({
    state: literal("unavailable"),
    reason: vObservationFailureReason,
  }),
);
const vConvexProjectObservation = object({
  convexProjectId: id("repositoryConvexProjects"),
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
  projects: RepositoryProviderObservationContext["convexProjects"],
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
}

async function readObservationContext(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<RepositoryProviderObservationContext> {
  return await ctx.runQuery(
    internal.repository.providerObservationQueries.readRepositoryProviderObservationContext,
    {
      repositoryId: args.repositoryId,
      userId: args.userId,
    },
  );
}

async function readCloudflareObservationInput(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    accountId: string;
  },
) {
  const connectionResolution = await ctx
    .runAction(internal.cloudflareOAuth.resolveConnectionForOrganization, {
      organizationId: args.organizationId,
      userId: args.userId,
    })
    .then(
      (connection) => ({ state: "available" as const, connection }),
      () => ({ state: "failed" as const }),
    );
  if (connectionResolution.state === "failed") {
    return { state: "failed" as const, reason: "request_failed" as const };
  }

  const connection = connectionResolution.connection;
  const token = connection?.auth.credential.trim();
  if (!connection || !token || connection.account.accountId !== args.accountId) {
    return { state: "failed" as const, reason: "connection_required" as const };
  }

  return {
    state: "available" as const,
    token,
    transport: resolveCloudflareApiTransport(connection.auth.method),
  };
}

export const observeCloudflareWorkers = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: array(vCloudflareWorkerObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerObservation[]> => {
    const context = await readObservationContext(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (context.cloudflareWorkers.length === 0) {
      return [];
    }
    if (context.cloudflareAccountId === undefined) {
      throw new Error("Cloudflare account is not configured for this repository.");
    }
    const input = await readCloudflareObservationInput(ctx, {
      organizationId: context.organizationId,
      userId: ctx.viewer.userId,
      accountId: context.cloudflareAccountId,
    });
    if (input.state === "failed") {
      return context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        workerId: worker.workerId,
        reason: input.reason,
      }));
    }

    return await Promise.all(
      context.cloudflareWorkers.map(async (worker) => {
        try {
          const identity = await readCloudflareWorkerIdentityByTag({
            token: input.token,
            transport: input.transport,
            accountId: worker.accountId,
            workerTag: worker.workerTag,
          });
          if (!identity || identity.workerTag !== worker.workerTag) {
            return {
              state: "missing" as const,
              workerId: worker.workerId,
            };
          }

          return {
            state: "available" as const,
            workerId: worker.workerId,
            workerName: identity.workerName,
            customDomains: identity.customDomains,
            workersDev: identity.workersDev,
          };
        } catch {
          return {
            state: "failed" as const,
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
  args: { repositoryId: id("repositories") },
  returns: array(vCloudflareWorkerBuildsObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerBuildsObservation[]> => {
    const context = await readObservationContext(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (context.cloudflareWorkers.length === 0) {
      return [];
    }
    if (context.cloudflareAccountId === undefined) {
      throw new Error("Cloudflare account is not configured for this repository.");
    }
    let defaultBranch: string;
    try {
      const githubAccess = await resolveGitHubAppAccess(ctx, {
        userId: ctx.viewer.userId,
        target: { kind: "repository", repositoryId: args.repositoryId },
      });
      const repository = await fetchGitHubRepoIdentity({
        octokit: githubAccess.octokit,
        owner: context.githubOwnerLogin,
        repo: context.githubRepositoryName,
        expectedRepoId: context.githubRepositoryDatabaseId,
      });
      defaultBranch = repository.defaultBranch;
    } catch {
      return context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        workerId: worker.workerId,
        reason: "request_failed" as const,
      }));
    }
    const input = await readCloudflareObservationInput(ctx, {
      organizationId: context.organizationId,
      userId: ctx.viewer.userId,
      accountId: context.cloudflareAccountId,
    });
    if (input.state === "failed") {
      return context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        workerId: worker.workerId,
        reason: input.reason,
      }));
    }

    return await Promise.all(
      context.cloudflareWorkers.map(async (worker) => {
        try {
          const [identity, discovery] = await Promise.all([
            readCloudflareWorkerIdentityByTag({
              token: input.token,
              transport: input.transport,
              accountId: worker.accountId,
              workerTag: worker.workerTag,
            }),
            readCloudflareWorkerBuildsDiscoveryForIdentity({
              token: input.token,
              transport: input.transport,
              accountId: worker.accountId,
              workerTag: worker.workerTag,
              defaultBranch,
              expectedRepoId: context.githubRepositoryDatabaseId,
            }),
          ]);
          if (!identity || identity.workerTag !== worker.workerTag) {
            return {
              state: "failed" as const,
              workerId: worker.workerId,
              reason: "request_failed" as const,
            };
          }
          let productionBuild:
            | ReturnType<typeof matchLatestCloudflareWorkerBuildForBranch>
            | {
                state: "unavailable";
                reasons: CloudflareProductionBuildUnavailableReasons;
              };
          const [valid, buildRead] = await readRecentCloudflareWorkerBuilds({
            token: input.token,
            transport: input.transport,
            accountId: worker.accountId,
            workerTag: worker.workerTag,
          });
          if (!valid) {
            productionBuild = {
              state: "unavailable",
              reasons: [
                Array.isArray(buildRead) ? "response_validation_failed" : "response_parse_failed",
              ],
            };
          } else {
            const buildMatch = matchLatestCloudflareWorkerBuildForBranch({
              builds: buildRead.builds,
              branch: defaultBranch,
              worker: {
                workerTag: worker.workerTag,
                rootDirectory: worker.rootDirectory,
              },
              githubRepositoryDatabaseId: context.githubRepositoryDatabaseId,
            });
            productionBuild =
              buildMatch.state === "absent" && !buildRead.exhausted
                ? { state: "unavailable", reasons: ["build_history_incomplete"] }
                : buildMatch;
          }
          return {
            state: "available" as const,
            workerId: worker.workerId,
            repository: discovery.repository,
            builds: discovery.builds,
            productionBuild:
              productionBuild.state === "available"
                ? {
                    state: "available" as const,
                    buildState: productionBuild.buildState,
                    logsUrl: buildCloudflareBuildLogsUrl({
                      accountId: worker.accountId,
                      workerName: identity.workerName,
                      buildUuid: productionBuild.buildUuid,
                    }),
                  }
                : productionBuild.state === "absent"
                  ? { state: "absent" as const }
                  : {
                      state: "unavailable" as const,
                      reasons: productionBuild.reasons,
                    },
          };
        } catch (error) {
          if (!(error instanceof CloudflareApiError)) {
            throw error;
          }
          console.error(
            `provider_observation_request_failed ${JSON.stringify({
              topic: "provider_observation_request_failed",
              version: 1,
              provider: "cloudflare",
              method: error.method,
              error_codes: error.details.flatMap((detail) =>
                detail.code === undefined ? [] : [detail.code],
              ),
            })}`,
          );
          return {
            state: "failed" as const,
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
  args: { repositoryId: id("repositories"), targets: array(vCloudflareWorkerBuildAccessTarget) },
  returns: array(vCloudflareWorkerConvexBuildAccessObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerConvexBuildAccessObservation[]> => {
    const context = await readObservationContext(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const targets = [...args.targets].sort((left, right) =>
      left.workerId.localeCompare(right.workerId),
    );
    const workersById = new Map(
      context.cloudflareWorkers.map((worker) => [worker.workerId, worker]),
    );
    if (
      targets.length > workersById.size ||
      new Set(targets.map((target) => target.workerId)).size !== targets.length ||
      targets.some((target) => !workersById.has(target.workerId))
    ) {
      throw new Error("Cloudflare Builds targets must belong to this repository.");
    }
    if (targets.length === 0) {
      return [];
    }
    if (context.cloudflareAccountId === undefined) {
      throw new Error("Cloudflare account is not configured for this repository.");
    }
    const input = await readCloudflareObservationInput(ctx, {
      organizationId: context.organizationId,
      userId: ctx.viewer.userId,
      accountId: context.cloudflareAccountId,
    });
    if (input.state === "failed") {
      return targets.map((target) => ({
        state: "failed" as const,
        workerId: target.workerId,
        reason: input.reason,
      }));
    }
    return await Promise.all(
      targets.map(async (target) => {
        const worker = workersById.get(target.workerId);
        if (!worker) {
          throw new Error("Cloudflare Worker must belong to this repository.");
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
            workerId: target.workerId,
            convexBuildAccess: resolveObservedConvexBuildAccess(
              observation,
              context.convexProjects,
            ),
          };
        } catch {
          return {
            state: "failed" as const,
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
  args: { repositoryId: id("repositories") },
  returns: array(vConvexProjectObservation),
  handler: async (ctx, args): Promise<ConvexProjectObservation[]> => {
    const context = await readObservationContext(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });

    let sourceResolution:
      | {
          state: "available";
          discovery: Awaited<ReturnType<typeof fetchGitHubConvexCodeLocationDiscovery>>;
        }
      | { state: "unavailable"; reason: "connection_required" | "request_failed" };
    try {
      const githubAccess = await resolveGitHubAppAccess(ctx, {
        userId: ctx.viewer.userId,
        target: { kind: "repository", repositoryId: args.repositoryId },
      });
      sourceResolution = {
        state: "available",
        discovery: await fetchGitHubConvexCodeLocationDiscovery({
          octokit: githubAccess.octokit,
          owner: context.githubOwnerLogin,
          repo: context.githubRepositoryName,
          expectedRepoId: context.githubRepositoryDatabaseId,
        }),
      };
    } catch {
      sourceResolution = { state: "unavailable", reason: "request_failed" };
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
            source = { state: "valid", kind: "config" };
          } else if (location?.kind === "directory") {
            source = { state: "valid", kind: "directory" };
          } else {
            source =
              sourceResolution.discovery.completeness === "partial"
                ? { state: "unavailable_partial" }
                : { state: "missing" };
          }
        }

        const matchingConnection = await ctx.runQuery(
          internal.organizationProviderCredentials.loadConvexForOrganizationTeam,
          {
            userId: ctx.viewer.userId,
            organizationId: context.organizationId,
            teamId: project.teamId,
          },
        );
        let provider: ConvexProjectProviderObservation;
        const credential = matchingConnection?.credential;
        if (!matchingConnection || !credential) {
          provider = { state: "unavailable", reason: "connection_required" };
          return {
            convexProjectId: project.convexProjectId,
            projectId: project.projectId,
            codeLocation: project.codeLocation,
            source,
            provider,
          };
        }

        const token = credential.auth.credential.trim();
        if (!token) {
          provider = { state: "unavailable", reason: "connection_required" };
          return {
            convexProjectId: project.convexProjectId,
            projectId: project.projectId,
            codeLocation: project.codeLocation,
            source,
            provider,
          };
        }
        try {
          const [valid, details] = await requestConvexManagementApi(
            token,
            "GET",
            "/projects/{project_id}",
            {
              params: { path: { project_id: project.projectId } },
            },
          );
          if (!valid) {
            provider = {
              state: "unavailable",
              reason: Array.isArray(details)
                ? "response_validation_failed"
                : "response_parse_failed",
            };
          } else {
            if (details.id !== project.projectId || details.teamId !== matchingConnection.teamId) {
              throw new Error("Convex returned an inconsistent project identity or team.");
            }
            const deployment = await readConvexProductionDeployment({
              token,
              projectId: project.projectId,
            });
            provider = {
              state: "current",
              projectSlug: details.slug,
              teamSlug: details.teamSlug,
              productionDeployment: deployment
                ? {
                    state: "available",
                    deploymentName: deployment.name,
                    dashboardUrl: buildConvexDeploymentDashboardUrl({
                      teamSlug: details.teamSlug,
                      projectSlug: details.slug,
                      deploymentName: deployment.name,
                    }),
                    region: deployment.region,
                  }
                : { state: "missing" },
            };
          }
        } catch (error) {
          if (!isConvexManagementNotFoundError(error)) {
            throw error;
          }
          provider = { state: "missing_ambiguous" };
        }
        return {
          convexProjectId: project.convexProjectId,
          projectId: project.projectId,
          codeLocation: project.codeLocation,
          source,
          provider,
        };
      }),
    );
  },
});
