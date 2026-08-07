"use node";

import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import {
  readRecentCloudflareWorkerBuilds,
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentity,
  readCloudflareWorkersDevSubdomain,
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
  vCloudflareBuildState,
} from "./cloudflareBuildMatching";
import {
  buildCloudflareBuildLogsUrl,
  buildConvexDeploymentDashboardUrl,
} from "./providerDashboardUrls";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

const { array, id, literal, object, string, union } = v;

const vObservationFailureReason = union(literal("connection_required"), literal("request_failed"));
const vCloudflareProductionBuildObservation = union(
  object({
    state: literal("available"),
    buildState: vCloudflareBuildState,
    logsUrl: string(),
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
    productionBuild: vCloudflareProductionBuildObservation,
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
    workerId: id("vaultCloudflareWorkers"),
    customDomains: array(string()),
    workersDev: vWorkersDevObservation,
  }),
  object({
    state: literal("missing"),
    workerId: id("vaultCloudflareWorkers"),
  }),
  object({
    state: literal("failed"),
    workerId: id("vaultCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vCloudflareWorkerBuildsObservation = union(
  object({
    state: literal("available"),
    workerId: id("vaultCloudflareWorkers"),
    repository: vCloudflareWorkerRepositoryDiscovery,
    builds: vCloudflareBuildsObservation,
  }),
  object({
    state: literal("failed"),
    workerId: id("vaultCloudflareWorkers"),
    reason: vObservationFailureReason,
  }),
);
const vCloudflareWorkerConvexBuildAccessObservation = union(
  object({
    state: literal("available"),
    workerId: id("vaultCloudflareWorkers"),
    convexBuildAccess: vCloudflareConvexBuildAccess,
  }),
  object({
    state: literal("failed"),
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
    dashboardUrl: string(),
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
  if (!connection || !token || connection.account?.accountId !== args.accountId) {
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
  args: { vaultId: id("vaults") },
  returns: array(vCloudflareWorkerObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerObservation[]> => {
    const context = await readObservationContext(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });

    const accountSubdomainRequests = new Map<
      string,
      Promise<
        { state: "available"; subdomain: string } | { state: "failed"; reason: "request_failed" }
      >
    >();
    const readAccountSubdomain = (input: {
      accountId: string;
      token: string;
      transport: ReturnType<typeof resolveCloudflareApiTransport>;
    }) => {
      const key = input.accountId;
      const existing = accountSubdomainRequests.get(key);
      if (existing) {
        return existing;
      }
      const request = readCloudflareWorkersDevSubdomain({
        token: input.token,
        transport: input.transport,
        accountId: input.accountId,
      }).then(
        (subdomain) => ({ state: "available" as const, subdomain }),
        () => ({ state: "failed" as const, reason: "request_failed" as const }),
      );
      accountSubdomainRequests.set(key, request);
      return request;
    };

    return await Promise.all(
      context.cloudflareWorkers.map(async (worker) => {
        try {
          const input = await readCloudflareObservationInput(ctx, {
            organizationId: context.organizationId,
            userId: ctx.viewer.userId,
            accountId: worker.accountId,
          });
          if (input.state === "failed") {
            return { state: "failed" as const, workerId: worker.workerId, reason: input.reason };
          }
          const [identity, accountSubdomain] = await Promise.all([
            readCloudflareWorkerIdentity({
              token: input.token,
              transport: input.transport,
              accountId: worker.accountId,
              workerName: worker.workerName,
            }),
            readAccountSubdomain({
              accountId: worker.accountId,
              token: input.token,
              transport: input.transport,
            }),
          ]);
          if (!identity || identity.workerTag !== worker.workerTag) {
            return {
              state: "missing" as const,
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
            workerId: worker.workerId,
            customDomains: identity.customDomains,
            workersDev,
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
  args: { vaultId: id("vaults") },
  returns: array(vCloudflareWorkerBuildsObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerBuildsObservation[]> => {
    const context = await readObservationContext(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    let defaultBranch: string;
    try {
      const githubAccess = await resolveGitHubAppAccess(ctx, {
        userId: ctx.viewer.userId,
        target: { kind: "vault", vaultId: args.vaultId },
      });
      const repository = await fetchGitHubRepoIdentity({
        octokit: githubAccess.octokit,
        owner: context.owner,
        repo: context.name,
        expectedRepoId: context.ghRepoId,
      });
      defaultBranch = repository.defaultBranch;
    } catch {
      return context.cloudflareWorkers.map((worker) => ({
        state: "failed" as const,
        workerId: worker.workerId,
        reason: "request_failed" as const,
      }));
    }

    return await Promise.all(
      context.cloudflareWorkers.map(async (worker) => {
        try {
          const input = await readCloudflareObservationInput(ctx, {
            organizationId: context.organizationId,
            userId: ctx.viewer.userId,
            accountId: worker.accountId,
          });
          if (input.state === "failed") {
            return { state: "failed" as const, workerId: worker.workerId, reason: input.reason };
          }
          const discovery = await readCloudflareWorkerBuildsDiscoveryForIdentity({
            token: input.token,
            transport: input.transport,
            accountId: worker.accountId,
            workerTag: worker.workerTag,
            defaultBranch,
            expectedRepoId: context.ghRepoId,
          });
          let productionBuild: ReturnType<typeof matchLatestCloudflareWorkerBuildForBranch> = {
            state: "provider_disagreement",
          };
          if (discovery.repository.state === "ready" && discovery.builds.state === "connected") {
            try {
              const buildRead = await readRecentCloudflareWorkerBuilds({
                token: input.token,
                transport: input.transport,
                accountId: worker.accountId,
                workerTag: worker.workerTag,
              });
              const buildMatch = matchLatestCloudflareWorkerBuildForBranch({
                builds: buildRead.builds,
                branch: defaultBranch,
                worker: {
                  workerTag: worker.workerTag,
                  rootDirectory: discovery.repository.rootDirectory,
                },
                ghRepoId: context.ghRepoId,
                triggerUuid: discovery.builds.productionTriggerUuid,
              });
              productionBuild =
                buildMatch.state === "absent" && !buildRead.exhausted
                  ? { state: "provider_disagreement" }
                  : buildMatch;
            } catch {
              productionBuild = { state: "provider_disagreement" };
            }
          }
          return {
            state: "available" as const,
            workerId: worker.workerId,
            repository: discovery.repository,
            builds:
              discovery.builds.state === "connected"
                ? {
                    ...discovery.builds,
                    productionBuild:
                      productionBuild.state === "available"
                        ? {
                            state: "available" as const,
                            buildState: productionBuild.buildState,
                            logsUrl: buildCloudflareBuildLogsUrl({
                              accountId: worker.accountId,
                              workerName: worker.workerName,
                              buildUuid: productionBuild.buildUuid,
                            }),
                          }
                        : productionBuild.state === "absent"
                          ? { state: "absent" as const }
                          : { state: "unavailable" as const },
                  }
                : discovery.builds,
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

export const observeCloudflareWorkerConvexBuildAccess = action({
  access: "access_dashboard",
  args: { vaultId: id("vaults"), targets: array(vCloudflareWorkerBuildAccessTarget) },
  returns: array(vCloudflareWorkerConvexBuildAccessObservation),
  handler: async (ctx, args): Promise<CloudflareWorkerConvexBuildAccessObservation[]> => {
    const context = await readObservationContext(ctx, {
      vaultId: args.vaultId,
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
      throw new Error("Cloudflare Builds targets must belong to this vault.");
    }
    return await Promise.all(
      targets.map(async (target) => {
        const worker = workersById.get(target.workerId);
        if (!worker) {
          throw new Error("Cloudflare Worker must belong to this vault.");
        }
        try {
          const input = await readCloudflareObservationInput(ctx, {
            organizationId: context.organizationId,
            userId: ctx.viewer.userId,
            accountId: worker.accountId,
          });
          if (input.state === "failed") {
            return { state: "failed" as const, workerId: target.workerId, reason: input.reason };
          }
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
  args: { vaultId: id("vaults") },
  returns: array(vConvexProjectObservation),
  handler: async (ctx, args): Promise<ConvexProjectObservation[]> => {
    const context = await readObservationContext(ctx, {
      vaultId: args.vaultId,
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
        target: { kind: "vault", vaultId: args.vaultId },
      });
      sourceResolution = {
        state: "available",
        discovery: await fetchGitHubConvexCodeLocationDiscovery({
          octokit: githubAccess.octokit,
          owner: context.owner,
          repo: context.name,
          expectedRepoId: context.ghRepoId,
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
          const details = await requestConvexManagementApi(token, "GET", "/projects/{project_id}", {
            params: { path: { project_id: project.projectId } },
          });
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
                }
              : { state: "missing" },
          };
        } catch (error) {
          provider = isConvexManagementNotFoundError(error)
            ? { state: "missing_ambiguous" }
            : { state: "unavailable", reason: "request_failed" };
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
