"use node";

import { v, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerBuildsPage,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentity,
  type CloudflareConvexBuildAccessObservation,
  type CloudflareWorkerBuild,
} from "../cloudflareResources";
import { action } from "../functions";
import { readConvexPreviewDeployments, readConvexProjectResource } from "./convexProjectResources";
import { buildVaultCloudflareBuildConfigForRootDirectory } from "./model";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

const { array, id, literal, null: vNull, object, string, union } = v;

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
const vConvexPreview = union(
  object({
    state: literal("available"),
    deploymentName: string(),
    dashboardUrl: string(),
  }),
  object({ state: literal("absent") }),
  object({ state: literal("unavailable") }),
);
const workerIdentityFields = {
  workerId: id("vaultCloudflareWorkers"),
  rootDirectory: string(),
  workerName: string(),
};
const vPullRequestWorkerResource = union(
  object({
    state: literal("available"),
    ...workerIdentityFields,
    buildState: vCloudflareBuildState,
    convexPreview: vConvexPreview,
  }),
  object({
    state: literal("absent"),
    ...workerIdentityFields,
  }),
  object({
    state: literal("unavailable"),
    ...workerIdentityFields,
  }),
);
const vPullRequestResourceHead = object({
  id: string(),
  url: string(),
  isCrossRepository: v.boolean(),
  headRepositoryId: union(string(), vNull()),
  headRefName: string(),
  headRefOid: string(),
});
const vPullRequestResources = object({
  pullRequestId: string(),
  workers: array(vPullRequestWorkerResource),
});

export type PullRequestResourceHead = Infer<typeof vPullRequestResourceHead>;
export type PullRequestWorkerResource = Infer<typeof vPullRequestWorkerResource>;
export type PullRequestResources = Infer<typeof vPullRequestResources>;

type StableWorker = VaultProviderObservationContext["cloudflareWorkers"][number];
type StableConvexProject = VaultProviderObservationContext["convexProjects"][number];
type CloudflareBuildState = Infer<typeof vCloudflareBuildState>;
type AvailableWorkerResource = Extract<PullRequestWorkerResource, { state: "available" }>;
type BuildMatch =
  | {
      state: "available";
      buildUuid: string;
      buildState: CloudflareBuildState;
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
type ConvexBuildAccessRead =
  | { state: "available"; buildAccess: CloudflareConvexBuildAccessObservation }
  | { state: "failed" };

function workerResourceIdentity(worker: StableWorker) {
  return {
    workerId: worker.workerId,
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

function classifyCloudflareBuildState(build: CloudflareWorkerBuild): CloudflareBuildState {
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
  head: PullRequestResourceHead;
  worker: {
    workerTag: string;
    rootDirectory: string;
  };
  ghRepoId: string;
  previewTriggerUuid: string;
  previewDeployCommand: string;
}): BuildMatch {
  const expectedPullRequestUrl = normalizeGitHubPullRequestUrl(args.head.url);
  if (expectedPullRequestUrl === null) {
    return { state: "provider_disagreement" };
  }

  const candidates = args.builds
    .filter(
      (build) =>
        normalizeGitHubPullRequestUrl(build.pull_request?.pull_request_url ?? "") ===
          expectedPullRequestUrl &&
        build.build_trigger_metadata?.commit_hash === args.head.headRefOid,
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
  head: PullRequestResourceHead;
  build: Pick<
    Extract<BuildMatch, { state: "available" }>,
    "buildState" | "createdAt" | "finishedAt"
  >;
}):
  | { state: "available"; deployment: ConvexCloudDeployment }
  | { state: "absent" }
  | {
      state: "unavailable";
      reason: "build_not_successful" | "fork_head" | "deployment_ambiguous";
    } {
  if (args.head.isCrossRepository || args.head.headRepositoryId === null) {
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

function unavailableWorkerResources(args: {
  heads: readonly PullRequestResourceHead[];
  worker: StableWorker;
}): PullRequestWorkerResource[] {
  const identity = workerResourceIdentity(args.worker);
  return args.heads.map(() => ({
    state: "unavailable",
    ...identity,
  }));
}

function resolveAttachedConvexProject(args: {
  worker: StableWorker;
  projects: readonly StableConvexProject[];
  buildAccess: CloudflareConvexBuildAccessObservation;
}): StableConvexProject | null {
  if (args.buildAccess.state !== "configured") {
    return null;
  }
  const reference = args.buildAccess.convexProject;
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

async function readWorkerResourcesForHeads(args: {
  context: VaultProviderObservationContext;
  worker: StableWorker;
  heads: readonly PullRequestResourceHead[];
  cloudflareToken: string;
  cloudflareTransport: ReturnType<typeof resolveCloudflareApiTransport>;
  convexToken: string;
  convexTeamId: string;
  previewReads: Map<string, Promise<ConvexPreviewRead>>;
}): Promise<PullRequestWorkerResource[]> {
  const identity = await readCloudflareWorkerIdentity({
    token: args.cloudflareToken,
    transport: args.cloudflareTransport,
    accountId: args.worker.accountId,
    workerName: args.worker.workerName,
  });
  if (!identity || identity.workerTag !== args.worker.workerTag) {
    return unavailableWorkerResources({
      heads: args.heads,
      worker: args.worker,
    });
  }

  const config = buildVaultCloudflareBuildConfigForRootDirectory({
    rootDirectory: args.worker.rootDirectory,
  });
  const discovery = await readCloudflareWorkerBuildsDiscoveryForIdentity({
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
    return unavailableWorkerResources({
      heads: args.heads,
      worker: args.worker,
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

  const identityFields = workerResourceIdentity(args.worker);
  let convexBuildAccessRead: Promise<ConvexBuildAccessRead> | undefined;
  const readConvexBuildAccess = () => {
    const existing = convexBuildAccessRead;
    if (existing) {
      return existing;
    }
    const request = readCloudflareWorkerConvexBuildAccess({
      token: args.cloudflareToken,
      transport: args.cloudflareTransport,
      accountId: args.worker.accountId,
      productionTriggerUuid: connectedBuilds.productionTriggerUuid,
      previewTriggerUuid: connectedBuilds.previewTriggerUuid,
    }).then(
      (buildAccess) => ({ state: "available" as const, buildAccess }),
      () => ({ state: "failed" as const }),
    );
    convexBuildAccessRead = request;
    return request;
  };

  return await Promise.all(
    args.heads.map(async (head): Promise<PullRequestWorkerResource> => {
      const match = matchCloudflareWorkerBuild({
        builds,
        head,
        worker: args.worker,
        ghRepoId: args.context.ghRepoId,
        previewTriggerUuid: connectedBuilds.previewTriggerUuid,
        previewDeployCommand: config.previewDeployCommand,
      });
      if (match.state === "absent") {
        return exhausted
          ? { state: "absent", ...identityFields }
          : {
              state: "unavailable",
              ...identityFields,
            };
      }
      if (match.state === "provider_disagreement") {
        return {
          state: "unavailable",
          ...identityFields,
        };
      }

      const unavailablePreview = () => ({ state: "unavailable" as const });
      let convexPreview: AvailableWorkerResource["convexPreview"];
      const buildAccessRead = await readConvexBuildAccess();
      if (buildAccessRead.state === "failed") {
        convexPreview = unavailablePreview();
      } else {
        const attachedProject = resolveAttachedConvexProject({
          worker: args.worker,
          projects: args.context.convexProjects,
          buildAccess: buildAccessRead.buildAccess,
        });
        if (!attachedProject) {
          convexPreview = unavailablePreview();
        } else if (!args.convexToken || attachedProject.teamId !== args.convexTeamId) {
          convexPreview = unavailablePreview();
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
            convexPreview = unavailablePreview();
          } else if (observedPreviews.state === "failed") {
            convexPreview = unavailablePreview();
          } else {
            const resolved = resolveConvexPreviewDeployment({
              deployments: observedPreviews.deployments,
              head,
              build: match,
            });
            if (resolved.state === "absent") {
              convexPreview = { state: "absent" };
            } else if (resolved.state === "unavailable") {
              convexPreview = unavailablePreview();
            } else {
              convexPreview = {
                state: "available",
                deploymentName: resolved.deployment.name,
                dashboardUrl: convexDashboardUrl({
                  teamSlug: observedPreviews.teamSlug,
                  projectSlug: observedPreviews.projectSlug,
                  deploymentName: resolved.deployment.name,
                }),
              };
            }
          }
        }
      }

      return {
        state: "available",
        ...identityFields,
        buildState: match.buildState,
        convexPreview,
      };
    }),
  );
}

export const getVisiblePullRequestResources = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    heads: array(vPullRequestResourceHead),
  },
  returns: array(vPullRequestResources),
  handler: async (ctx, args): Promise<PullRequestResources[]> => {
    if (args.heads.length > MAX_VISIBLE_PULL_REQUEST_HEADS) {
      throw new Error("At most 25 pull request heads can be observed at once.");
    }
    const seenPullRequests = new Set<string>();
    for (const head of args.heads) {
      if (normalizeGitHubPullRequestUrl(head.url) === null || seenPullRequests.has(head.id)) {
        throw new Error("Pull request head identity was invalid or duplicated.");
      }
      seenPullRequests.add(head.id);
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
    const resourcesByPullRequest = new Map<string, PullRequestWorkerResource[]>();
    for (const head of args.heads) {
      resourcesByPullRequest.set(head.id, []);
    }

    if (!cloudflareConnection || !cloudflareToken) {
      for (const worker of context.cloudflareWorkers) {
        const resources = unavailableWorkerResources({
          heads: args.heads,
          worker,
        });
        args.heads.forEach((head, index) => {
          resourcesByPullRequest.get(head.id)?.push(resources[index]);
        });
      }
    } else {
      const previewReads = new Map<string, Promise<ConvexPreviewRead>>();
      const cloudflareTransport = resolveCloudflareApiTransport(cloudflareConnection.auth.method);
      const workerResources = await Promise.all(
        context.cloudflareWorkers.map(async (worker) => {
          try {
            return await readWorkerResourcesForHeads({
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
            return unavailableWorkerResources({
              heads: args.heads,
              worker,
            });
          }
        }),
      );
      context.cloudflareWorkers.forEach((worker, workerIndex) => {
        args.heads.forEach((head, headIndex) => {
          const resource = workerResources[workerIndex][headIndex];
          if (resource.workerId !== worker.workerId) {
            throw new Error("Pull request resources lost stable Worker identity.");
          }
          resourcesByPullRequest.get(head.id)?.push(resource);
        });
      });
    }

    return args.heads.map((head) => ({
      pullRequestId: head.id,
      workers: resourcesByPullRequest.get(head.id) ?? [],
    }));
  },
});
