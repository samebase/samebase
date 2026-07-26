"use node";

import { Octokit } from "@octokit/rest";
import { v, type Infer } from "convex/values";
import { z } from "zod";

import { getConvexCodeRootDirectory } from "../../shared/convexCodeLocation";
import { internal } from "../_generated/api";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerBuildsPage,
  readCloudflareWorkerIdentity,
  type CloudflareWorkerBuild,
} from "../cloudflareResources";
import { action } from "../functions";
import { createGitHubRequestDeadlineSignal, fetchGitHubRepoIdentity } from "../githubRepoApi";
import { readConvexPreviewDeployments, readConvexProjectResource } from "./convexProjectResources";
import {
  matchCloudflareWorkerBuildForCommit,
  type CloudflareBuildMatch,
  vCloudflareBuildState,
} from "./cloudflareBuildMatching";
import {
  buildCloudflareBuildLogsUrl,
  buildConvexDeploymentDashboardUrl,
} from "./providerDashboardUrls";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

const { array, id, literal, object, string, union } = v;

const CLOUDFLARE_BUILD_PAGE_SIZE = 100;
const CLOUDFLARE_BUILD_MAX_PAGES = 2;
const CLOUDFLARE_GITHUB_APP_DATABASE_ID = 85455;
const GITHUB_PULL_REQUEST_RESOURCE_LIMIT = 100;

const vPullRequestConvexResource = union(
  object({
    state: literal("available"),
    convexProjectId: id("vaultConvexProjects"),
    rootDirectory: string(),
    deploymentName: string(),
    dashboardUrl: string(),
  }),
  object({
    state: literal("absent"),
    convexProjectId: id("vaultConvexProjects"),
    rootDirectory: string(),
  }),
  object({
    state: literal("unavailable"),
    convexProjectId: id("vaultConvexProjects"),
    rootDirectory: string(),
  }),
);
const vCloudflareBranchPreview = union(
  object({ state: literal("available"), url: string() }),
  object({ state: literal("absent") }),
  object({ state: literal("unavailable") }),
);
const vCloudflareBuild = object({
  uuid: string(),
  state: vCloudflareBuildState,
  logsUrl: string(),
});
const stableWorkerIdentityFields = {
  workerId: id("vaultCloudflareWorkers"),
  workerName: string(),
};
const observedWorkerIdentityFields = {
  ...stableWorkerIdentityFields,
  rootDirectory: string(),
};
const vPullRequestWorkerResource = union(
  object({
    state: literal("available"),
    ...observedWorkerIdentityFields,
    cloudflareBuild: vCloudflareBuild,
    cloudflareBranchPreview: vCloudflareBranchPreview,
  }),
  object({
    state: literal("absent"),
    ...observedWorkerIdentityFields,
  }),
  object({
    state: literal("unavailable"),
    ...stableWorkerIdentityFields,
  }),
);
const vPullRequestResources = object({
  pullRequestId: string(),
  workers: array(vPullRequestWorkerResource),
  convexProjects: array(vPullRequestConvexResource),
});

export type PullRequestWorkerResource = Infer<typeof vPullRequestWorkerResource>;
export type PullRequestConvexResource = Infer<typeof vPullRequestConvexResource>;
export type PullRequestResources = Infer<typeof vPullRequestResources>;

const providerPullRequestResourceIdentitySchema = z.object({
  __typename: z.literal("PullRequest"),
  id: z.string().min(1),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  repository: z.object({ databaseId: z.number().int().positive() }),
});
const providerCloudflareCheckRunSchema = z.object({
  name: z.string().min(1),
  externalId: z.string().min(1).nullable(),
  status: z.string().min(1),
  conclusion: z.string().min(1).nullable(),
  summary: z.string().nullable(),
});
const providerPullRequestResourceHeadSchema = providerPullRequestResourceIdentitySchema.extend({
  url: z.url(),
  isCrossRepository: z.boolean(),
  state: z.literal("OPEN"),
  headRepository: z.object({ id: z.string().min(1) }).nullable(),
  headRefName: z.string().min(1),
  headRefOid: z.string().min(1),
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({
          oid: z.string().min(1),
          checkSuites: z.object({
            totalCount: z.number().int().nonnegative(),
            nodes: z.array(
              z.object({
                checkRuns: z.object({
                  totalCount: z.number().int().nonnegative(),
                  nodes: z.array(providerCloudflareCheckRunSchema),
                }),
              }),
            ),
          }),
        }),
      }),
    ),
  }),
});
const providerPullRequestResourceHeadsSchema = z.object({ nodes: z.array(z.unknown()) });
const providerMissingPullRequestNodeErrorsSchema = z
  .array(
    z.object({
      type: z.literal("NOT_FOUND"),
      path: z.tuple([z.literal("nodes")]).rest(z.union([z.string(), z.number()])),
    }),
  )
  .nonempty();
const providerMissingPullRequestNodesErrorSchema = z.object({
  name: z.literal("GraphqlResponseError"),
  errors: providerMissingPullRequestNodeErrorsSchema,
  data: z.unknown(),
});
type ProviderPullRequestResourceHead = z.infer<typeof providerPullRequestResourceHeadSchema>;
type ProviderCloudflareCheckRun = z.infer<typeof providerCloudflareCheckRunSchema>;
export type PullRequestResourceHead = Pick<
  ProviderPullRequestResourceHead,
  "id" | "url" | "isCrossRepository" | "headRefName" | "headRefOid"
> & {
  headRepositoryId: string | null;
  cloudflareChecks:
    | { state: "available"; runs: ProviderCloudflareCheckRun[] }
    | { state: "unavailable" };
};
type PullRequestResourceHeadRead =
  | { state: "available"; head: PullRequestResourceHead }
  | { state: "unavailable"; pullRequestId: string };

const PULL_REQUEST_RESOURCE_HEADS_QUERY = `
  query PullRequestResourceHeads($ids: [ID!]!, $cloudflareAppId: Int!) {
    nodes(ids: $ids) {
      __typename
      ... on PullRequest {
        id
        url
        isCrossRepository
        state
        repository { databaseId }
        headRepository { id }
        headRefName
        headRefOid
        commits(last: 1) {
          nodes {
            commit {
              oid
              checkSuites(first: 20, filterBy: { appId: $cloudflareAppId }) {
                totalCount
                nodes {
                  checkRuns(first: 100) {
                    totalCount
                    nodes { name externalId status conclusion summary }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export function normalizeGitHubPullRequestResourceHeadReads(
  value: unknown,
  args: {
    ghRepoId: string;
    pullRequestIds: readonly string[];
  },
): PullRequestResourceHeadRead[] {
  const providerHeads = providerPullRequestResourceHeadsSchema.parse(value).nodes;
  if (providerHeads.length !== args.pullRequestIds.length) {
    throw new Error("GitHub returned an incomplete pull request resource response.");
  }

  return providerHeads.map((value, index) => {
    const pullRequestId = args.pullRequestIds[index];
    if (value === null) {
      return { state: "unavailable", pullRequestId };
    }
    const identity = providerPullRequestResourceIdentitySchema.parse(value);
    if (identity.id !== pullRequestId || String(identity.repository.databaseId) !== args.ghRepoId) {
      throw new Error("GitHub pull request identity changed.");
    }
    if (identity.state !== "OPEN") {
      return { state: "unavailable", pullRequestId };
    }
    const head = providerPullRequestResourceHeadSchema.parse(value);
    const commit = head.commits.nodes.at(0)?.commit;
    const completeCloudflareChecks =
      head.commits.nodes.length === 1 &&
      commit?.oid === head.headRefOid &&
      commit.checkSuites.totalCount === commit.checkSuites.nodes.length &&
      commit.checkSuites.nodes.every(
        (suite) => suite.checkRuns.totalCount === suite.checkRuns.nodes.length,
      );
    return {
      state: "available",
      head: {
        id: head.id,
        url: head.url,
        isCrossRepository: head.isCrossRepository,
        headRepositoryId: head.headRepository?.id ?? null,
        headRefName: head.headRefName,
        headRefOid: head.headRefOid,
        cloudflareChecks: completeCloudflareChecks
          ? {
              state: "available",
              runs: commit.checkSuites.nodes.flatMap((suite) => suite.checkRuns.nodes),
            }
          : { state: "unavailable" },
      },
    };
  });
}

export function recoverGitHubPullRequestResourceHeadsFromError(error: unknown): unknown {
  const parsed = providerMissingPullRequestNodesErrorSchema.safeParse(error);
  if (!parsed.success) {
    throw error;
  }
  return parsed.data.data;
}

type StableWorker = VaultProviderObservationContext["cloudflareWorkers"][number];
type StableConvexProject = VaultProviderObservationContext["convexProjects"][number];
type AvailableWorkerResource = Extract<PullRequestWorkerResource, { state: "available" }>;
type PullRequestResourceAccumulator = {
  workers: PullRequestWorkerResource[];
  convexProjects: PullRequestConvexResource[];
};
type ConvexPreviewRead =
  | {
      state: "available";
      projectSlug: string;
      teamSlug: string;
      deployments: ConvexCloudDeployment[];
    }
  | { state: "missing" }
  | { state: "failed" };
type PullRequestProviderFailureOperation =
  | "read_cloudflare_worker_resources"
  | "read_convex_preview"
  | "resolve_cloudflare_connection";

function providerFailureKind(error: unknown): "error" | "timeout" | "unknown" {
  if (!(error instanceof Error)) {
    return "unknown";
  }
  return error.name === "AbortError" || error.name === "TimeoutError" ? "timeout" : "error";
}

function reportPullRequestProviderFailure(args: {
  operation: PullRequestProviderFailureOperation;
  error: unknown;
  workerId?: StableWorker["workerId"];
  convexProjectId?: string;
}): void {
  console.warn("Pull request resource provider read failed.", {
    operation: args.operation,
    failureKind: providerFailureKind(args.error),
    ...(args.workerId ? { workerId: args.workerId } : {}),
    ...(args.convexProjectId ? { convexProjectId: args.convexProjectId } : {}),
  });
}

function workerResourceIdentity(worker: StableWorker) {
  return {
    workerId: worker.workerId,
    workerName: worker.workerName,
  };
}

function observedWorkerResourceIdentity(worker: StableWorker, rootDirectory: string) {
  return {
    ...workerResourceIdentity(worker),
    rootDirectory,
  };
}

function convexProjectResourceIdentity(project: StableConvexProject) {
  return {
    convexProjectId: project.convexProjectId,
    rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
  };
}

export function resolveConvexPreviewDeployment(args: {
  deployments: readonly ConvexCloudDeployment[];
  head: PullRequestResourceHead;
}):
  | { state: "available"; deployment: ConvexCloudDeployment }
  | { state: "absent" }
  | {
      state: "unavailable";
      reason: "fork_head" | "deployment_ambiguous";
    } {
  if (args.head.isCrossRepository || args.head.headRepositoryId === null) {
    return { state: "unavailable", reason: "fork_head" };
  }

  const matches = args.deployments.filter(
    (deployment) =>
      deployment.previewIdentifier === args.head.headRefName &&
      deployment.reference === `preview/${args.head.headRefName}`,
  );
  if (matches.length === 0) {
    return { state: "absent" };
  }
  if (matches.length > 1) {
    return { state: "unavailable", reason: "deployment_ambiguous" };
  }
  return { state: "available", deployment: matches[0] };
}

export function resolveCloudflareBranchPreviewUrl(args: {
  checks: PullRequestResourceHead["cloudflareChecks"];
  workerName: string;
  build: Pick<Extract<CloudflareBuildMatch, { state: "available" }>, "buildUuid" | "buildState">;
}):
  | { state: "available"; url: string }
  | { state: "absent" }
  | {
      state: "unavailable";
      reason: "checks_unavailable" | "check_ambiguous" | "provider_disagreement" | "url_ambiguous";
    } {
  if (args.build.buildState !== "success") {
    return { state: "absent" };
  }
  if (args.checks.state === "unavailable") {
    return { state: "unavailable", reason: "checks_unavailable" };
  }

  const checks = args.checks.runs.filter((check) => check.externalId === args.build.buildUuid);
  if (checks.length === 0) {
    return { state: "absent" };
  }
  if (checks.length > 1) {
    return { state: "unavailable", reason: "check_ambiguous" };
  }
  const check = checks[0];
  if (check.name !== `Workers Builds: ${args.workerName}`) {
    return { state: "unavailable", reason: "provider_disagreement" };
  }
  if (check.status !== "COMPLETED" || check.conclusion !== "SUCCESS") {
    return { state: "absent" };
  }

  const previewAliasLabel = "Preview Alias URL: ";
  const previewUrls = (check.summary ?? "")
    .split(/\r?\n/)
    .flatMap((line) =>
      line.startsWith(previewAliasLabel) ? [line.slice(previewAliasLabel.length).trim()] : [],
    )
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.protocol === "https:" &&
          parsed.username === "" &&
          parsed.password === "" &&
          parsed.port === "" &&
          parsed.pathname === "/" &&
          parsed.search === "" &&
          parsed.hash === "" &&
          parsed.hostname.endsWith(".workers.dev") &&
          parsed.hostname.includes(`-${args.workerName}.`)
        );
      } catch {
        return false;
      }
    });
  if (previewUrls.length === 0) {
    return { state: "absent" };
  }
  if (previewUrls.length > 1) {
    return { state: "unavailable", reason: "url_ambiguous" };
  }
  return { state: "available", url: previewUrls[0] };
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

async function readConvexPreview(args: {
  token: string;
  teamId: string;
  project: StableConvexProject;
}): Promise<ConvexPreviewRead> {
  try {
    const details = await readConvexProjectResource({
      token: args.token,
      teamId: args.teamId,
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
  } catch (error) {
    reportPullRequestProviderFailure({
      operation: "read_convex_preview",
      error,
      convexProjectId: args.project.convexProjectId,
    });
    return { state: "failed" };
  }
}

function unavailableConvexProjectResources(args: {
  heads: readonly PullRequestResourceHead[];
  project: StableConvexProject;
}): PullRequestConvexResource[] {
  const identity = convexProjectResourceIdentity(args.project);
  return args.heads.map(() => ({ state: "unavailable", ...identity }));
}

async function readConvexProjectResourcesForHeads(args: {
  project: StableConvexProject;
  heads: readonly PullRequestResourceHead[];
  token: string;
  teamId: string;
}): Promise<PullRequestConvexResource[]> {
  const identity = convexProjectResourceIdentity(args.project);
  const observedPreviews = await readConvexPreview({
    token: args.token,
    teamId: args.teamId,
    project: args.project,
  });
  if (observedPreviews.state !== "available") {
    return unavailableConvexProjectResources(args);
  }

  return args.heads.map((head): PullRequestConvexResource => {
    const resolved = resolveConvexPreviewDeployment({
      deployments: observedPreviews.deployments,
      head,
    });
    if (resolved.state === "absent") {
      return { state: "absent", ...identity };
    }
    if (resolved.state === "unavailable") {
      return { state: "unavailable", ...identity };
    }
    return {
      state: "available",
      ...identity,
      deploymentName: resolved.deployment.name,
      dashboardUrl: buildConvexDeploymentDashboardUrl({
        teamSlug: observedPreviews.teamSlug,
        projectSlug: observedPreviews.projectSlug,
        deploymentName: resolved.deployment.name,
      }),
    };
  });
}

async function readWorkerResourcesForHeads(args: {
  context: VaultProviderObservationContext;
  worker: StableWorker;
  heads: readonly PullRequestResourceHead[];
  defaultBranch: string;
  cloudflareToken: string;
  cloudflareTransport: ReturnType<typeof resolveCloudflareApiTransport>;
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

  const discovery = await readCloudflareWorkerBuildsDiscoveryForIdentity({
    token: args.cloudflareToken,
    transport: args.cloudflareTransport,
    accountId: args.worker.accountId,
    workerTag: args.worker.workerTag,
    defaultBranch: args.defaultBranch,
    expectedRepoId: args.context.ghRepoId,
  });
  const repository = discovery.repository;
  const connectedBuilds = discovery.builds;
  if (repository.state !== "ready" || connectedBuilds.state !== "connected") {
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

  const identityFields = observedWorkerResourceIdentity(args.worker, repository.rootDirectory);
  return await Promise.all(
    args.heads.map(async (head): Promise<PullRequestWorkerResource> => {
      const match = matchCloudflareWorkerBuildForCommit({
        builds,
        branch: head.headRefName,
        commitHash: head.headRefOid,
        worker: {
          workerTag: args.worker.workerTag,
          rootDirectory: repository.rootDirectory,
        },
        ghRepoId: args.context.ghRepoId,
        triggerUuid: connectedBuilds.previewTriggerUuid,
      });
      if (match.state === "absent") {
        return exhausted
          ? { state: "absent", ...identityFields }
          : {
              state: "unavailable",
              ...workerResourceIdentity(args.worker),
            };
      }
      if (match.state === "provider_disagreement") {
        return {
          state: "unavailable",
          ...workerResourceIdentity(args.worker),
        };
      }

      const unavailablePreview = () => ({ state: "unavailable" as const });
      let cloudflareBranchPreview: AvailableWorkerResource["cloudflareBranchPreview"];
      if (identity.previewUrlsEnabled === false || match.buildState !== "success") {
        cloudflareBranchPreview = { state: "absent" };
      } else {
        const resolved = resolveCloudflareBranchPreviewUrl({
          checks: head.cloudflareChecks,
          workerName: args.worker.workerName,
          build: match,
        });
        cloudflareBranchPreview =
          resolved.state === "available"
            ? { state: "available", url: resolved.url }
            : resolved.state === "absent"
              ? { state: "absent" }
              : unavailablePreview();
      }

      return {
        state: "available",
        ...identityFields,
        cloudflareBuild: {
          uuid: match.buildUuid,
          state: match.buildState,
          logsUrl: buildCloudflareBuildLogsUrl({
            accountId: args.worker.accountId,
            workerName: args.worker.workerName,
            buildUuid: match.buildUuid,
          }),
        },
        cloudflareBranchPreview,
      };
    }),
  );
}

export function validatePullRequestResourceIds(pullRequestIds: readonly string[]): void {
  if (pullRequestIds.length < 1 || pullRequestIds.length > GITHUB_PULL_REQUEST_RESOURCE_LIMIT) {
    throw new Error("Pull request resource count must be between 1 and 100.");
  }
  const seenPullRequests = new Set<string>();
  for (const pullRequestId of pullRequestIds) {
    if (!pullRequestId || seenPullRequests.has(pullRequestId)) {
      throw new Error("Pull request identity was invalid or duplicated.");
    }
    seenPullRequests.add(pullRequestId);
  }
}

async function readGitHubPullRequestResourceHeadReads(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  pullRequestIds: readonly string[];
}): Promise<PullRequestResourceHeadRead[]> {
  let response: unknown;
  try {
    response = await args.octokit.graphql(PULL_REQUEST_RESOURCE_HEADS_QUERY, {
      ids: args.pullRequestIds,
      cloudflareAppId: CLOUDFLARE_GITHUB_APP_DATABASE_ID,
      request: { signal: args.signal },
    });
  } catch (error) {
    response = recoverGitHubPullRequestResourceHeadsFromError(error);
  }
  return normalizeGitHubPullRequestResourceHeadReads(response, {
    ghRepoId: args.ghRepoId,
    pullRequestIds: args.pullRequestIds,
  });
}

export const getPullRequestResources = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    pullRequestIds: array(string()),
  },
  returns: array(vPullRequestResources),
  handler: async (ctx, args): Promise<PullRequestResources[]> => {
    validatePullRequestResourceIds(args.pullRequestIds);

    const [context, githubConnection, cloudflareConnection, convexConnection] = await Promise.all([
      ctx.runQuery(internal.vault.providerObservationQueries.readVaultProviderObservationContext, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: ctx.viewer.userId,
        kind: "github",
      }),
      ctx
        .runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
          userId: ctx.viewer.userId,
        })
        .catch((error) => {
          reportPullRequestProviderFailure({
            operation: "resolve_cloudflare_connection",
            error,
          });
          return null;
        }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: ctx.viewer.userId,
        kind: "convex",
      }),
    ]);
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub connection unavailable.");
    }
    const octokit = new Octokit({ auth: githubConnection.auth.credential });
    const signal = createGitHubRequestDeadlineSignal();
    const [repository, headReads] = await Promise.all([
      fetchGitHubRepoIdentity({
        githubAccessToken: githubConnection.auth.credential,
        owner: context.owner,
        repo: context.name,
        expectedRepoId: context.ghRepoId,
        signal,
      }),
      readGitHubPullRequestResourceHeadReads({
        octokit,
        signal,
        ghRepoId: context.ghRepoId,
        pullRequestIds: args.pullRequestIds,
      }),
    ]);
    const heads = headReads.flatMap((read) => (read.state === "available" ? [read.head] : []));
    const cloudflareToken = cloudflareConnection?.auth.credential.trim() ?? "";
    const convexToken =
      convexConnection?.kind === "convex" ? convexConnection.auth.credential.trim() : "";
    const convexTeamId = convexConnection?.kind === "convex" ? convexConnection.teamId.trim() : "";
    const resourcesByPullRequest = new Map<string, PullRequestResourceAccumulator>();
    for (const pullRequestId of args.pullRequestIds) {
      resourcesByPullRequest.set(pullRequestId, { workers: [], convexProjects: [] });
    }
    for (const read of headReads) {
      if (read.state === "available") {
        continue;
      }
      const resources = resourcesByPullRequest.get(read.pullRequestId);
      if (!resources) {
        throw new Error("Pull request resources lost requested identity.");
      }
      for (const worker of context.cloudflareWorkers) {
        resources.workers.push({ state: "unavailable", ...workerResourceIdentity(worker) });
      }
      for (const project of context.convexProjects) {
        resources.convexProjects.push({
          state: "unavailable",
          ...convexProjectResourceIdentity(project),
        });
      }
    }

    if (!cloudflareConnection || !cloudflareToken) {
      for (const worker of context.cloudflareWorkers) {
        const resources = unavailableWorkerResources({
          heads,
          worker,
        });
        heads.forEach((head, index) => {
          const pullRequestResources = resourcesByPullRequest.get(head.id);
          if (!pullRequestResources) {
            throw new Error("Pull request resources lost requested identity.");
          }
          pullRequestResources.workers.push(resources[index]);
        });
      }
    } else {
      const cloudflareTransport = resolveCloudflareApiTransport(cloudflareConnection.auth.method);
      const workerResources = await Promise.all(
        context.cloudflareWorkers.map(async (worker) => {
          try {
            return await readWorkerResourcesForHeads({
              context,
              worker,
              heads,
              defaultBranch: repository.defaultBranch,
              cloudflareToken,
              cloudflareTransport,
            });
          } catch (error) {
            reportPullRequestProviderFailure({
              operation: "read_cloudflare_worker_resources",
              error,
              workerId: worker.workerId,
            });
            return unavailableWorkerResources({
              heads,
              worker,
            });
          }
        }),
      );
      context.cloudflareWorkers.forEach((worker, workerIndex) => {
        heads.forEach((head, headIndex) => {
          const resource = workerResources[workerIndex][headIndex];
          if (resource.workerId !== worker.workerId) {
            throw new Error("Pull request resources lost stable Worker identity.");
          }
          const pullRequestResources = resourcesByPullRequest.get(head.id);
          if (!pullRequestResources) {
            throw new Error("Pull request resources lost requested identity.");
          }
          pullRequestResources.workers.push(resource);
        });
      });
    }

    if (!convexToken || !convexTeamId) {
      for (const project of context.convexProjects) {
        const resources = unavailableConvexProjectResources({ heads, project });
        heads.forEach((head, index) => {
          const pullRequestResources = resourcesByPullRequest.get(head.id);
          if (!pullRequestResources) {
            throw new Error("Pull request resources lost requested identity.");
          }
          pullRequestResources.convexProjects.push(resources[index]);
        });
      }
    } else {
      const projectResources = await Promise.all(
        context.convexProjects.map((project) =>
          readConvexProjectResourcesForHeads({
            project,
            heads,
            token: convexToken,
            teamId: convexTeamId,
          }),
        ),
      );
      context.convexProjects.forEach((project, projectIndex) => {
        heads.forEach((head, headIndex) => {
          const resource = projectResources[projectIndex][headIndex];
          if (resource.convexProjectId !== project.convexProjectId) {
            throw new Error("Pull request resources lost stable Convex project identity.");
          }
          const pullRequestResources = resourcesByPullRequest.get(head.id);
          if (!pullRequestResources) {
            throw new Error("Pull request resources lost requested identity.");
          }
          pullRequestResources.convexProjects.push(resource);
        });
      });
    }

    return args.pullRequestIds.map((pullRequestId) => {
      const resources = resourcesByPullRequest.get(pullRequestId);
      if (!resources) {
        throw new Error("Pull request resources lost requested identity.");
      }
      return { pullRequestId, ...resources };
    });
  },
});
