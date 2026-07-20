"use node";

import { v, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  readCloudflareWorkerBuildsPage,
  readCloudflareWorkerDeploymentDiscoveryForIdentity,
  readCloudflareWorkerIdentity,
  type CloudflareWorkerBuild,
} from "../cloudflareResources";
import { action } from "../functions";
import {
  vPullRequestHeadIdentity,
  type PullRequestHeadIdentity,
} from "../repositoryPullRequestObservations";
import { readConvexPreviewDeployments, readConvexProjectResource } from "./convexProjectResources";
import { buildVaultCloudflareBuildConfigForRootDirectory } from "./model";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

const { array, id, literal, null: vNull, number, object, string, union } = v;

const CLOUDFLARE_BUILD_PAGE_SIZE = 100;
const CLOUDFLARE_BUILD_MAX_PAGES = 2;
const MAX_VISIBLE_PULL_REQUEST_HEADS = 25;

const vCloudflareBuildState = union(
  literal("queued"),
  literal("running"),
  literal("success"),
  literal("failure"),
  literal("cancelled"),
  literal("skipped"),
  literal("unknown"),
);
const vConvexPreviewObservation = union(
  object({
    state: literal("available"),
    convexProjectId: id("vaultConvexProjects"),
    deploymentName: string(),
    deploymentUrl: string(),
    dashboardUrl: string(),
  }),
  object({
    state: literal("absent"),
    convexProjectId: id("vaultConvexProjects"),
  }),
  object({
    state: literal("unavailable"),
    reason: union(
      literal("build_not_successful"),
      literal("connection_required"),
      literal("fork_head"),
      literal("marker_unavailable"),
      literal("project_mismatch"),
      literal("project_missing"),
      literal("request_failed"),
      literal("deployment_ambiguous"),
    ),
  }),
);
const workerIdentityFields = {
  workerId: id("vaultCloudflareWorkers"),
  appId: id("vaultApps"),
  rootDirectory: string(),
  workerName: string(),
};
const vPullRequestWorkerBuildObservation = union(
  object({
    state: literal("available"),
    ...workerIdentityFields,
    buildUuid: string(),
    buildState: vCloudflareBuildState,
    createdAt: number(),
    startedAt: number(),
    finishedAt: union(number(), vNull()),
    convexPreview: vConvexPreviewObservation,
  }),
  object({
    state: literal("absent"),
    ...workerIdentityFields,
  }),
  object({
    state: literal("unavailable"),
    ...workerIdentityFields,
    reason: union(
      literal("connection_required"),
      literal("worker_missing"),
      literal("builds_not_connected"),
      literal("provider_disagreement"),
      literal("pagination_guardrail"),
      literal("request_failed"),
    ),
  }),
);
const vPullRequestResourceObservation = object({
  head: vPullRequestHeadIdentity,
  workers: array(vPullRequestWorkerBuildObservation),
});
const vPullRequestResourceObservationBatch = object({
  state: literal("current"),
  observedAt: number(),
  observations: array(vPullRequestResourceObservation),
});

export type PullRequestWorkerBuildObservation = Infer<typeof vPullRequestWorkerBuildObservation>;
export type PullRequestResourceObservationBatch = Infer<
  typeof vPullRequestResourceObservationBatch
>;

type StableWorker = VaultProviderObservationContext["cloudflareWorkers"][number];
type StableConvexProject = VaultProviderObservationContext["convexProjects"][number];
type AvailableWorkerBuild = Extract<PullRequestWorkerBuildObservation, { state: "available" }>;
type BuildMatch =
  | {
      state: "available";
      buildUuid: string;
      buildState: AvailableWorkerBuild["buildState"];
      createdAt: number;
      startedAt: number;
      finishedAt: number | null;
    }
  | { state: "absent" }
  | { state: "provider_disagreement" };
type ConvexPreviewRead =
  | {
      state: "available";
      projectSlug: string;
      teamSlug: string;
      deployments: ConvexCloudDeployment[];
    }
  | { state: "missing" }
  | { state: "failed" };

function workerObservationIdentity(worker: StableWorker) {
  return {
    workerId: worker.workerId,
    appId: worker.appId,
    rootDirectory: worker.rootDirectory,
    workerName: worker.workerName,
  };
}

function normalizeGitHubPullRequestUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const path = url.pathname.replace(/\/+$/, "");
    if (!/^\/[^/]+\/[^/]+\/pull\/[1-9][0-9]*$/.test(path)) {
      return null;
    }
    return `https://github.com${path}`;
  } catch {
    return null;
  }
}

function providerTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function classifyCloudflareBuildState(
  build: CloudflareWorkerBuild,
): AvailableWorkerBuild["buildState"] {
  if (build.status !== "stopped") {
    switch (build.status) {
      case "queued":
        return "queued";
      case "initializing":
      case "running":
        return "running";
      case undefined:
        return "unknown";
      default:
        build.status satisfies never;
        return "unknown";
    }
  }

  switch (build.build_outcome) {
    case "success":
      return "success";
    case "fail":
    case "terminated":
      return "failure";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped";
    case undefined:
      return "unknown";
    default:
      build.build_outcome satisfies never;
      return "unknown";
  }
}

export function matchCloudflareWorkerBuild(args: {
  builds: readonly CloudflareWorkerBuild[];
  head: PullRequestHeadIdentity;
  worker: {
    workerTag: string;
    rootDirectory: string;
  };
  ghRepoId: string;
  previewTriggerUuid: string;
  previewDeployCommand: string;
}): BuildMatch {
  const expectedPullRequestUrl = normalizeGitHubPullRequestUrl(args.head.pullRequestUrl);
  if (expectedPullRequestUrl === null) {
    return { state: "provider_disagreement" };
  }

  const candidates = args.builds
    .filter(
      (build) =>
        normalizeGitHubPullRequestUrl(build.pull_request?.pull_request_url ?? "") ===
          expectedPullRequestUrl && build.build_trigger_metadata?.commit_hash === args.head.headOid,
    )
    .map((build) => ({
      build,
      createdAt: providerTimestamp(build.created_on),
    }))
    .sort(
      (left, right) =>
        (right.createdAt ?? -1) - (left.createdAt ?? -1) ||
        (left.build.build_uuid ?? "").localeCompare(right.build.build_uuid ?? ""),
    );
  const candidate = candidates.at(0);
  if (candidate === undefined) {
    return { state: "absent" };
  }

  const build = candidate.build;
  const trigger = build.trigger;
  const metadata = build.build_trigger_metadata;
  const buildUuid = build.build_uuid;
  const createdAt = candidate.createdAt;
  const startedAt =
    providerTimestamp(build.running_on) ?? providerTimestamp(build.initializing_on) ?? createdAt;
  const finishedAt = providerTimestamp(build.stopped_on);
  if (
    !trigger ||
    !metadata ||
    !buildUuid ||
    createdAt === null ||
    startedAt === null ||
    trigger.external_script_id !== args.worker.workerTag ||
    trigger.trigger_uuid !== args.previewTriggerUuid ||
    trigger.repo_connection?.repo_id !== args.ghRepoId ||
    trigger.root_directory !== args.worker.rootDirectory ||
    metadata.root_directory !== args.worker.rootDirectory ||
    metadata.build_trigger_source !== "pull_request" ||
    metadata.branch !== args.head.headRefName ||
    trigger.deploy_command !== args.previewDeployCommand ||
    metadata.deploy_command !== args.previewDeployCommand
  ) {
    return { state: "provider_disagreement" };
  }

  return {
    state: "available",
    buildUuid,
    buildState: classifyCloudflareBuildState(build),
    createdAt,
    startedAt,
    finishedAt,
  };
}

export function resolveConvexPreviewDeployment(args: {
  deployments: readonly ConvexCloudDeployment[];
  head: PullRequestHeadIdentity;
  build: Pick<AvailableWorkerBuild, "buildState" | "createdAt" | "finishedAt">;
}):
  | { state: "available"; deployment: ConvexCloudDeployment }
  | { state: "absent" }
  | {
      state: "unavailable";
      reason: "build_not_successful" | "fork_head" | "deployment_ambiguous";
    } {
  if (
    args.head.headRepositoryNodeId === null ||
    args.head.headRepositoryNodeId !== args.head.baseRepositoryNodeId
  ) {
    return { state: "unavailable", reason: "fork_head" };
  }
  if (args.build.buildState !== "success" || args.build.finishedAt === null) {
    return { state: "unavailable", reason: "build_not_successful" };
  }
  const finishedAt = args.build.finishedAt;

  const matches = args.deployments.filter(
    (deployment) =>
      deployment.previewIdentifier === args.head.headRefName &&
      deployment.reference === `preview/${args.head.headRefName}` &&
      deployment.lastDeployTime !== null &&
      deployment.lastDeployTime !== undefined &&
      deployment.lastDeployTime >= args.build.createdAt &&
      deployment.lastDeployTime <= finishedAt,
  );
  if (matches.length === 0) {
    return { state: "absent" };
  }
  if (matches.length > 1) {
    return { state: "unavailable", reason: "deployment_ambiguous" };
  }
  return { state: "available", deployment: matches[0] };
}

function unavailableWorkerObservations(args: {
  heads: readonly PullRequestHeadIdentity[];
  worker: StableWorker;
  reason: Extract<PullRequestWorkerBuildObservation, { state: "unavailable" }>["reason"];
}): PullRequestWorkerBuildObservation[] {
  const identity = workerObservationIdentity(args.worker);
  return args.heads.map(() => ({
    state: "unavailable",
    ...identity,
    reason: args.reason,
  }));
}

function resolveAttachedConvexProject(args: {
  worker: StableWorker;
  projects: readonly StableConvexProject[];
  discovery: Awaited<ReturnType<typeof readCloudflareWorkerDeploymentDiscoveryForIdentity>>;
}): StableConvexProject | null {
  if (
    args.discovery.builds.state !== "connected" ||
    args.discovery.builds.convexBuildAccess.state !== "configured"
  ) {
    return null;
  }
  const reference = args.discovery.builds.convexBuildAccess.convexProject;
  return (
    args.projects.find(
      (project) =>
        project.appId === args.worker.appId &&
        project.teamId === reference.teamId &&
        project.projectId === reference.projectId,
    ) ?? null
  );
}

async function readConvexPreview(args: {
  token: string;
  project: StableConvexProject;
}): Promise<ConvexPreviewRead> {
  try {
    const details = await readConvexProjectResource({
      token: args.token,
      teamId: args.project.teamId,
      projectId: args.project.projectId,
    });
    if (!details) {
      return { state: "missing" };
    }
    const deployments = await readConvexPreviewDeployments({
      token: args.token,
      projectId: args.project.projectId,
    });
    return {
      state: "available",
      projectSlug: details.slug,
      teamSlug: details.teamSlug,
      deployments,
    };
  } catch {
    return { state: "failed" };
  }
}

function convexDashboardUrl(args: {
  teamSlug: string;
  projectSlug: string;
  deploymentName: string;
}): string {
  return `https://dashboard.convex.dev/t/${encodeURIComponent(args.teamSlug)}/${encodeURIComponent(args.projectSlug)}/${encodeURIComponent(args.deploymentName)}`;
}

async function observeWorkerForHeads(args: {
  context: VaultProviderObservationContext;
  worker: StableWorker;
  heads: readonly PullRequestHeadIdentity[];
  cloudflareToken: string;
  cloudflareTransport: ReturnType<typeof resolveCloudflareApiTransport>;
  convexToken: string;
  convexTeamId: string;
  previewReads: Map<string, Promise<ConvexPreviewRead>>;
}): Promise<PullRequestWorkerBuildObservation[]> {
  const identity = await readCloudflareWorkerIdentity({
    token: args.cloudflareToken,
    transport: args.cloudflareTransport,
    accountId: args.worker.accountId,
    workerName: args.worker.workerName,
  });
  if (!identity || identity.workerTag !== args.worker.workerTag) {
    return unavailableWorkerObservations({
      heads: args.heads,
      worker: args.worker,
      reason: "worker_missing",
    });
  }

  const config = buildVaultCloudflareBuildConfigForRootDirectory({
    rootDirectory: args.worker.rootDirectory,
  });
  const discovery = await readCloudflareWorkerDeploymentDiscoveryForIdentity({
    token: args.cloudflareToken,
    transport: args.cloudflareTransport,
    accountId: args.worker.accountId,
    workerTag: args.worker.workerTag,
    defaultBranch: args.context.defaultBranch,
    expectedRepoId: args.context.ghRepoId,
    buildConfig: {
      rootDir: config.rootDirectory,
      buildCommand: config.buildCommand,
      deployCommand: config.deployCommand,
      previewDeployCommand: config.previewDeployCommand,
      pathIncludes: config.pathIncludes,
      pathExcludes: config.pathExcludes,
    },
  });
  const connectedBuilds = discovery.builds;
  if (connectedBuilds.state !== "connected") {
    return unavailableWorkerObservations({
      heads: args.heads,
      worker: args.worker,
      reason: "builds_not_connected",
    });
  }

  const builds: CloudflareWorkerBuild[] = [];
  let exhausted = false;
  for (let page = 1; page <= CLOUDFLARE_BUILD_MAX_PAGES; page += 1) {
    const pageBuilds = await readCloudflareWorkerBuildsPage({
      token: args.cloudflareToken,
      transport: args.cloudflareTransport,
      accountId: args.worker.accountId,
      workerTag: args.worker.workerTag,
      page,
      perPage: CLOUDFLARE_BUILD_PAGE_SIZE,
    });
    builds.push(...pageBuilds);
    if (pageBuilds.length < CLOUDFLARE_BUILD_PAGE_SIZE) {
      exhausted = true;
      break;
    }
  }

  const attachedProject = resolveAttachedConvexProject({
    worker: args.worker,
    projects: args.context.convexProjects,
    discovery,
  });
  const identityFields = workerObservationIdentity(args.worker);

  return await Promise.all(
    args.heads.map(async (head): Promise<PullRequestWorkerBuildObservation> => {
      const match = matchCloudflareWorkerBuild({
        builds,
        head,
        worker: args.worker,
        ghRepoId: args.context.ghRepoId,
        previewTriggerUuid: connectedBuilds.build.preview.triggerUuid,
        previewDeployCommand: config.previewDeployCommand,
      });
      if (match.state === "absent") {
        return exhausted
          ? { state: "absent", ...identityFields }
          : {
              state: "unavailable",
              ...identityFields,
              reason: "pagination_guardrail",
            };
      }
      if (match.state === "provider_disagreement") {
        return {
          state: "unavailable",
          ...identityFields,
          reason: "provider_disagreement",
        };
      }

      const unavailablePreview = (
        reason: Extract<AvailableWorkerBuild["convexPreview"], { state: "unavailable" }>["reason"],
      ) => ({ state: "unavailable" as const, reason });
      let convexPreview: AvailableWorkerBuild["convexPreview"];
      if (!attachedProject) {
        convexPreview = unavailablePreview(
          connectedBuilds.convexBuildAccess.state === "configured"
            ? "project_mismatch"
            : "marker_unavailable",
        );
      } else if (!args.convexToken || attachedProject.teamId !== args.convexTeamId) {
        convexPreview = unavailablePreview("connection_required");
      } else {
        let previewRead = args.previewReads.get(attachedProject.convexProjectId);
        if (!previewRead) {
          previewRead = readConvexPreview({
            token: args.convexToken,
            project: attachedProject,
          });
          args.previewReads.set(attachedProject.convexProjectId, previewRead);
        }
        const observedPreviews = await previewRead;
        if (observedPreviews.state === "missing") {
          convexPreview = unavailablePreview("project_missing");
        } else if (observedPreviews.state === "failed") {
          convexPreview = unavailablePreview("request_failed");
        } else {
          const resolved = resolveConvexPreviewDeployment({
            deployments: observedPreviews.deployments,
            head,
            build: match,
          });
          if (resolved.state === "absent") {
            convexPreview = {
              state: "absent",
              convexProjectId: attachedProject.convexProjectId,
            };
          } else if (resolved.state === "unavailable") {
            convexPreview = unavailablePreview(resolved.reason);
          } else {
            convexPreview = {
              state: "available",
              convexProjectId: attachedProject.convexProjectId,
              deploymentName: resolved.deployment.name,
              deploymentUrl: resolved.deployment.deploymentUrl,
              dashboardUrl: convexDashboardUrl({
                teamSlug: observedPreviews.teamSlug,
                projectSlug: observedPreviews.projectSlug,
                deploymentName: resolved.deployment.name,
              }),
            };
          }
        }
      }

      return {
        state: "available",
        ...identityFields,
        buildUuid: match.buildUuid,
        buildState: match.buildState,
        createdAt: match.createdAt,
        startedAt: match.startedAt,
        finishedAt: match.finishedAt,
        convexPreview,
      };
    }),
  );
}

export const observeVisiblePullRequestResources = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    heads: array(vPullRequestHeadIdentity),
  },
  returns: vPullRequestResourceObservationBatch,
  handler: async (ctx, args): Promise<PullRequestResourceObservationBatch> => {
    if (args.heads.length > MAX_VISIBLE_PULL_REQUEST_HEADS) {
      throw new Error("At most 25 pull request heads can be observed at once.");
    }
    const seenPullRequests = new Set<string>();
    for (const head of args.heads) {
      if (
        head.pullRequestNumber <= 0 ||
        normalizeGitHubPullRequestUrl(head.pullRequestUrl) === null ||
        seenPullRequests.has(head.pullRequestNodeId)
      ) {
        throw new Error("Pull request head identity was invalid or duplicated.");
      }
      seenPullRequests.add(head.pullRequestNodeId);
    }

    const context: VaultProviderObservationContext = await ctx.runQuery(
      internal.vault.providerObservationQueries.readVaultProviderObservationContext,
      {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      },
    );
    const cloudflareConnection = await ctx
      .runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
        userId: ctx.viewer.userId,
      })
      .catch(() => null);
    const cloudflareToken = cloudflareConnection?.auth.credential.trim() ?? "";
    const convexConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "convex",
    });
    const convexToken =
      convexConnection?.kind === "convex" ? convexConnection.auth.credential.trim() : "";
    const convexTeamId = convexConnection?.kind === "convex" ? convexConnection.teamId.trim() : "";
    const observationsByPullRequest = new Map<string, PullRequestWorkerBuildObservation[]>();
    for (const head of args.heads) {
      observationsByPullRequest.set(head.pullRequestNodeId, []);
    }

    if (!cloudflareConnection || !cloudflareToken) {
      for (const worker of context.cloudflareWorkers) {
        const observations = unavailableWorkerObservations({
          heads: args.heads,
          worker,
          reason: "connection_required",
        });
        args.heads.forEach((head, index) => {
          observationsByPullRequest.get(head.pullRequestNodeId)?.push(observations[index]);
        });
      }
    } else {
      const previewReads = new Map<string, Promise<ConvexPreviewRead>>();
      const cloudflareTransport = resolveCloudflareApiTransport(cloudflareConnection.auth.method);
      const workerObservations = await Promise.all(
        context.cloudflareWorkers.map(async (worker) => {
          try {
            return await observeWorkerForHeads({
              context,
              worker,
              heads: args.heads,
              cloudflareToken,
              cloudflareTransport,
              convexToken,
              convexTeamId,
              previewReads,
            });
          } catch {
            return unavailableWorkerObservations({
              heads: args.heads,
              worker,
              reason: "request_failed",
            });
          }
        }),
      );
      context.cloudflareWorkers.forEach((worker, workerIndex) => {
        args.heads.forEach((head, headIndex) => {
          const observation = workerObservations[workerIndex][headIndex];
          if (observation.workerId !== worker.workerId) {
            throw new Error("Pull request resource observations lost stable Worker identity.");
          }
          observationsByPullRequest.get(head.pullRequestNodeId)?.push(observation);
        });
      });
    }

    return {
      state: "current",
      observedAt: Date.now(),
      observations: args.heads.map((head) => ({
        head,
        workers: observationsByPullRequest.get(head.pullRequestNodeId) ?? [],
      })),
    };
  },
});
