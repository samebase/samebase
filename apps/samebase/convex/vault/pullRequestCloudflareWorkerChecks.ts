"use node";

import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import { allLimited } from "../common";
import type { CloudflareBuildState } from "./cloudflareBuildMatching";
import type {
  CloudflareWorkerBuildRead,
  CloudflareWorkerPreview,
  CloudflareWorkerProofRead,
} from "./pullRequestCloudflareWorkerProof";

const CLOUDFLARE_GITHUB_APP_DATABASE_ID = 85455;
const CLOUDFLARE_GITHUB_APP_SLUG = "cloudflare-workers-and-pages";
const GITHUB_CHECK_RUN_PAGE_SIZE = 100;

export type CloudflareWorkerCheckRunInput = {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
  externalId: string | null;
  title: string | null;
  summary: string | null;
};

export type CloudflareCommitCheckRuns = {
  checkRuns: CloudflareWorkerCheckRunInput[];
};

type PullRequestCommit = {
  id: string;
  oid: string;
};

type PullRequestCommitScan =
  | {
      state: "available";
      commits: PullRequestCommit[];
      totalCount: number;
      before: string | null;
    }
  | { state: "unavailable" };

export type CloudflareWorkerCheckPullRequest = {
  id: string;
  baseRefOid: string;
  headRefOid: string;
  commitScan: PullRequestCommitScan;
};

const providerGitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const providerPullRequestResourceIdentitySchema = z.object({
  __typename: z.literal("PullRequest"),
  id: z.string().min(1),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  repository: z.object({ databaseId: z.number().int().positive() }),
});
const providerCloudflareCheckRunSchema = z.object({
  __typename: z.literal("CheckRun"),
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().min(1),
  conclusion: z.string().min(1).nullable(),
  detailsUrl: z.string().min(1).nullable(),
  externalId: z.string().min(1).nullable(),
  title: z.string().min(1).nullable(),
  summary: z.string().nullable(),
});
const providerCloudflareCheckRunConnectionSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().min(1).nullable(),
  }),
  nodes: z.array(providerCloudflareCheckRunSchema).max(GITHUB_CHECK_RUN_PAGE_SIZE),
});
const providerCloudflareCheckSuiteSchema = z.object({
  __typename: z.literal("CheckSuite"),
  id: z.string().min(1),
  app: z.object({
    databaseId: z.number().int().positive(),
    slug: z.string().min(1),
  }),
  checkRuns: providerCloudflareCheckRunConnectionSchema,
});
const providerCloudflareCheckSuiteConnectionSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  nodes: z.array(providerCloudflareCheckSuiteSchema).max(1),
});
const providerCloudflareCommitCheckSchema = z.object({
  __typename: z.literal("Commit"),
  id: z.string().min(1),
  oid: providerGitObjectIdSchema,
  checkSuites: providerCloudflareCheckSuiteConnectionSchema,
});
const providerCloudflareCheckBatchSchema = z.object({
  commits: z.array(z.unknown()),
  pullRequests: z.array(z.unknown()),
});
const providerCloudflareCheckRunPageSchema = z.object({
  pullRequests: z.array(z.unknown()),
  suite: z.unknown(),
});
const providerRecoverablePullRequestErrorSchema = z.object({
  name: z.literal("GraphqlResponseError"),
  errors: z
    .array(
      z.object({
        type: z.string().min(1),
        path: z.array(z.union([z.string(), z.number()])).nonempty(),
      }),
    )
    .nonempty(),
  data: z.unknown(),
});

const PULL_REQUEST_CLOUDFLARE_CHECKS_QUERY = `
  query PullRequestCloudflareChecks($commitIds: [ID!]!, $pullRequestIds: [ID!]!) {
    commits: nodes(ids: $commitIds) {
      __typename
      ... on Commit {
        id
        oid
        checkSuites(
          first: 1
          filterBy: { appId: ${CLOUDFLARE_GITHUB_APP_DATABASE_ID} }
        ) {
          totalCount
          nodes {
            __typename
            id
            app { databaseId slug }
            checkRuns(
              first: ${GITHUB_CHECK_RUN_PAGE_SIZE}
              filterBy: { checkType: LATEST }
            ) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                __typename
                id
                name
                status
                conclusion
                detailsUrl
                externalId
                title
                summary
              }
            }
          }
        }
      }
    }
    pullRequests: nodes(ids: $pullRequestIds) {
      __typename
      ... on PullRequest {
        id
        state
        repository { databaseId }
        baseRefOid
        headRefOid
      }
    }
  }
`;

const PULL_REQUEST_CLOUDFLARE_CHECK_RUN_PAGE_QUERY = `
  query PullRequestCloudflareCheckRunPage(
    $suiteId: ID!
    $pullRequestIds: [ID!]!
    $after: String
  ) {
    suite: node(id: $suiteId) {
      __typename
      ... on CheckSuite {
        id
        app { databaseId slug }
        checkRuns(
          first: ${GITHUB_CHECK_RUN_PAGE_SIZE}
          after: $after
          filterBy: { checkType: LATEST }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            __typename
            id
            name
            status
            conclusion
            detailsUrl
            externalId
            title
            summary
          }
        }
      }
    }
    pullRequests: nodes(ids: $pullRequestIds) {
      __typename
      ... on PullRequest {
        id
        state
        repository { databaseId }
        baseRefOid
        headRefOid
      }
    }
  }
`;

function cloudflareDashboardTarget(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "dash.cloudflare.com" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }

    if (parsed.pathname === "/") {
      const entries = [...parsed.searchParams.entries()];
      if (
        entries.length !== 1 ||
        entries[0][0] !== "to" ||
        /%(?:2f|5c)/i.test(parsed.search) ||
        /%(?:2f|5c)/i.test(entries[0][1])
      ) {
        return null;
      }
      return entries[0][1];
    }

    return parsed.search === "" && !/%(?:2f|5c)/i.test(parsed.pathname) ? parsed.pathname : null;
  } catch {
    return null;
  }
}

function parseCloudflareWorkerBuildLogsUrl(
  url: string,
): { accountId: string; buildUuid: string; workerName: string } | null {
  const target = cloudflareDashboardTarget(url);
  if (target === null) {
    return null;
  }
  const segments = target.split("/").filter((segment) => segment.length > 0);
  if (
    segments.length !== 8 ||
    segments[1] !== "workers" ||
    segments[2] !== "services" ||
    segments[3] !== "view" ||
    segments[5] !== "production" ||
    segments[6] !== "builds" ||
    !segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    return null;
  }
  return { accountId: segments[0], buildUuid: segments[7], workerName: segments[4] };
}

function parseCloudflareWorkerScriptUrl(
  url: string,
): { accountId: string; workerName: string } | null {
  const target = cloudflareDashboardTarget(url);
  if (target === null) {
    return null;
  }
  const segments = target.split("/").filter((segment) => segment.length > 0);
  if (
    segments.length !== 6 ||
    segments[1] !== "workers" ||
    segments[2] !== "services" ||
    segments[3] !== "view" ||
    segments[5] !== "production" ||
    !segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    return null;
  }
  return { accountId: segments[0], workerName: segments[4] };
}

function normalizeCloudflareWorkerPreviewUrl(
  url: string,
  workerName: string,
): { url: string; zone: string } | null {
  try {
    const parsed = new URL(url);
    const workerMarker = `-${workerName.toLowerCase()}.`;
    const workerMarkerIndex = parsed.hostname.lastIndexOf(workerMarker);
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname.endsWith(".workers.dev") &&
      workerMarkerIndex >= 0
      ? {
          url: parsed.origin,
          zone: parsed.hostname.slice(workerMarkerIndex + workerMarker.length),
        }
      : null;
  } catch {
    return null;
  }
}

function parseCloudflareCheckRunBuildState(
  status: string,
  conclusion: string | null,
): CloudflareBuildState {
  switch (status) {
    case "QUEUED":
    case "PENDING":
    case "REQUESTED":
    case "WAITING":
      return "queued";
    case "IN_PROGRESS":
      return "running";
    case "COMPLETED":
      break;
    default:
      return "unknown";
  }

  switch (conclusion) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "TIMED_OUT":
    case "ACTION_REQUIRED":
    case "STARTUP_FAILURE":
    case "STALE":
      return "failure";
    case "CANCELLED":
      return "cancelled";
    case "SKIPPED":
    case "NEUTRAL":
      return "skipped";
    case null:
    default:
      return "unknown";
  }
}

function readCloudflareCheckSummaryFields(summary: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (const line of summary.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z ]+):\s*(.+)$/);
    if (match === null) {
      continue;
    }
    const label = match[1];
    if (fields.has(label)) {
      return null;
    }
    fields.set(label, match[2]);
  }
  return fields;
}

function markdownLink(value: string): { label: string; url: string } | null {
  const match = value.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
  return match === null ? null : { label: match[1], url: match[2] };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type CloudflareWorkerCheckCandidate = CloudflareWorkerBuildRead & {
  preview: CloudflareWorkerPreview | null;
};

function parseCloudflareWorkerCheckRun(
  checkRun: CloudflareWorkerCheckRunInput,
): CloudflareWorkerCheckCandidate | null | "unavailable" {
  if (!checkRun.name.startsWith("Workers Builds: ")) {
    return null;
  }
  const workerName = checkRun.name.slice("Workers Builds: ".length);
  if (
    workerName.length === 0 ||
    checkRun.title !== checkRun.name ||
    checkRun.detailsUrl === null ||
    checkRun.externalId === null ||
    checkRun.summary === null
  ) {
    return "unavailable";
  }

  const logsIdentity = parseCloudflareWorkerBuildLogsUrl(checkRun.detailsUrl);
  const fields = readCloudflareCheckSummaryFields(checkRun.summary);
  const buildLink = fields === null ? null : markdownLink(fields.get("Build ID") ?? "");
  const scriptLink = fields === null ? null : markdownLink(fields.get("Script") ?? "");
  const scriptIdentity =
    scriptLink === null ? null : parseCloudflareWorkerScriptUrl(scriptLink.url);
  if (
    logsIdentity === null ||
    fields === null ||
    buildLink === null ||
    scriptLink === null ||
    scriptIdentity === null ||
    workerName !== logsIdentity.workerName ||
    workerName !== scriptLink.label ||
    workerName !== scriptIdentity.workerName ||
    logsIdentity.accountId !== scriptIdentity.accountId ||
    !/^[0-9a-f]{32}$/.test(logsIdentity.accountId) ||
    !isUuid(logsIdentity.buildUuid) ||
    checkRun.externalId !== logsIdentity.buildUuid ||
    buildLink.label !== logsIdentity.buildUuid ||
    buildLink.url !== checkRun.detailsUrl
  ) {
    return "unavailable";
  }

  const versionId = fields.get("Version ID");
  if (versionId !== undefined && !isUuid(versionId)) {
    return "unavailable";
  }
  const previewUrl = fields.get("Preview URL");
  const previewAliasUrl = fields.get("Preview Alias URL");
  if ((previewUrl === undefined) !== (previewAliasUrl === undefined)) {
    return "unavailable";
  }

  if (previewUrl !== undefined && previewAliasUrl !== undefined) {
    const normalizedPreview = normalizeCloudflareWorkerPreviewUrl(previewUrl, workerName);
    const normalizedAlias = normalizeCloudflareWorkerPreviewUrl(previewAliasUrl, workerName);
    if (
      versionId === undefined ||
      normalizedPreview === null ||
      normalizedAlias === null ||
      normalizedPreview.zone !== normalizedAlias.zone ||
      !new URL(normalizedPreview.url).hostname.startsWith(`${versionId.slice(0, 8).toLowerCase()}-`)
    ) {
      return "unavailable";
    }
    return {
      accountId: logsIdentity.accountId,
      buildUuid: logsIdentity.buildUuid,
      buildState: parseCloudflareCheckRunBuildState(checkRun.status, checkRun.conclusion),
      logsUrl: checkRun.detailsUrl,
      name: workerName,
      preview: {
        kind: "worker",
        accountId: logsIdentity.accountId,
        name: workerName,
        url: normalizedAlias.url,
      },
    };
  }

  return {
    accountId: logsIdentity.accountId,
    buildUuid: logsIdentity.buildUuid,
    buildState: parseCloudflareCheckRunBuildState(checkRun.status, checkRun.conclusion),
    logsUrl: checkRun.detailsUrl,
    name: workerName,
    preview: null,
  };
}

export function resolveCloudflareWorkerCheckRuns(
  commits: readonly CloudflareCommitCheckRuns[],
): CloudflareWorkerProofRead {
  const selected = new Map<string, CloudflareWorkerCheckCandidate>();
  for (const commit of [...commits].reverse()) {
    const current = new Map<string, CloudflareWorkerCheckCandidate>();
    for (const checkRun of commit.checkRuns) {
      const candidate = parseCloudflareWorkerCheckRun(checkRun);
      if (candidate === "unavailable") {
        return { state: "unavailable" };
      }
      if (candidate === null) {
        continue;
      }
      const workerIdentity = `${candidate.accountId}:${candidate.name}`;
      if (current.has(workerIdentity)) {
        return { state: "unavailable" };
      }
      current.set(workerIdentity, candidate);
    }
    for (const [identity, candidate] of current) {
      if (!selected.has(identity)) {
        selected.set(identity, candidate);
      }
    }
  }

  const candidates = [...selected.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.accountId.localeCompare(right.accountId) ||
      left.buildUuid.localeCompare(right.buildUuid),
  );
  return {
    state: "available",
    previews: candidates.flatMap((candidate) =>
      candidate.preview === null ? [] : [candidate.preview],
    ),
    workerBuilds: candidates.map((candidate) => ({
      accountId: candidate.accountId,
      buildUuid: candidate.buildUuid,
      buildState: candidate.buildState,
      logsUrl: candidate.logsUrl,
      name: candidate.name,
    })),
  };
}

type CloudflareCheckRunScan = {
  commitId: string;
  suiteId: string;
  checkRuns: CloudflareWorkerCheckRunInput[];
  totalCount: number;
  after: string | null;
};

function normalizeGitHubCloudflareCheckRunPage(
  value: unknown,
  identity: Pick<CloudflareCheckRunScan, "commitId" | "suiteId">,
  previous?: CloudflareCheckRunScan,
): CloudflareCheckRunScan | null {
  const parsed = providerCloudflareCheckRunConnectionSchema.safeParse(value);
  if (!parsed.success || (previous && parsed.data.totalCount !== previous.totalCount)) {
    return null;
  }
  const checkRuns = [...(previous?.checkRuns ?? [])];
  const seen = new Set(checkRuns.map((checkRun) => checkRun.id));
  for (const checkRun of parsed.data.nodes) {
    if (seen.has(checkRun.id)) {
      return null;
    }
    seen.add(checkRun.id);
    checkRuns.push(checkRun);
  }

  const { endCursor, hasNextPage } = parsed.data.pageInfo;
  if (
    checkRuns.length > parsed.data.totalCount ||
    (hasNextPage &&
      (endCursor === null ||
        endCursor === previous?.after ||
        parsed.data.nodes.length === 0 ||
        checkRuns.length === parsed.data.totalCount)) ||
    (!hasNextPage && checkRuns.length !== parsed.data.totalCount)
  ) {
    return null;
  }

  return {
    ...identity,
    checkRuns,
    totalCount: parsed.data.totalCount,
    after: hasNextPage ? endCursor : null,
  };
}

function recoverGitHubCloudflareCheckData(error: unknown): unknown {
  const parsed = providerRecoverablePullRequestErrorSchema.safeParse(error);
  if (
    !parsed.success ||
    !parsed.data.errors.every(
      (providerError) =>
        providerError.type === "NOT_FOUND" &&
        (providerError.path[0] === "commits" ||
          providerError.path[0] === "pullRequests" ||
          providerError.path[0] === "suite"),
    )
  ) {
    throw error;
  }
  return parsed.data.data;
}

function matchesCloudflareCheckPullRequest(args: {
  value: unknown;
  head: CloudflareWorkerCheckPullRequest;
  ghRepoId: string;
}): boolean {
  const identity = providerPullRequestResourceIdentitySchema.safeParse(args.value);
  const pullRequest = z
    .object({
      baseRefOid: providerGitObjectIdSchema,
      headRefOid: providerGitObjectIdSchema,
    })
    .safeParse(args.value);
  return (
    identity.success &&
    pullRequest.success &&
    identity.data.id === args.head.id &&
    identity.data.state === "OPEN" &&
    String(identity.data.repository.databaseId) === args.ghRepoId &&
    pullRequest.data.baseRefOid === args.head.baseRefOid &&
    pullRequest.data.headRefOid === args.head.headRefOid
  );
}

async function completeGitHubCloudflareCheckRunScan(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  scan: CloudflareCheckRunScan;
  headsById: ReadonlyMap<string, CloudflareWorkerCheckPullRequest>;
  pullRequestIds: readonly string[];
}): Promise<{
  scan: CloudflareCheckRunScan | null;
  availablePullRequestIds: string[];
}> {
  let scan = args.scan;
  let availablePullRequestIds = [...args.pullRequestIds];
  while (scan.after !== null) {
    let response: unknown;
    try {
      response = await args.octokit.graphql(PULL_REQUEST_CLOUDFLARE_CHECK_RUN_PAGE_QUERY, {
        suiteId: scan.suiteId,
        pullRequestIds: availablePullRequestIds,
        after: scan.after,
        request: { signal: args.signal },
      });
    } catch (error) {
      try {
        response = recoverGitHubCloudflareCheckData(error);
      } catch {
        return { scan: null, availablePullRequestIds: [] };
      }
    }
    const page = providerCloudflareCheckRunPageSchema.safeParse(response);
    if (!page.success || page.data.pullRequests.length !== availablePullRequestIds.length) {
      return { scan: null, availablePullRequestIds: [] };
    }
    availablePullRequestIds = availablePullRequestIds.filter((pullRequestId, index) => {
      const head = args.headsById.get(pullRequestId);
      return (
        head !== undefined &&
        matchesCloudflareCheckPullRequest({
          value: page.data.pullRequests[index],
          head,
          ghRepoId: args.ghRepoId,
        })
      );
    });
    if (availablePullRequestIds.length === 0) {
      return { scan: null, availablePullRequestIds };
    }
    const suite = providerCloudflareCheckSuiteSchema.safeParse(page.data.suite);
    if (
      !suite.success ||
      suite.data.id !== scan.suiteId ||
      suite.data.app.databaseId !== CLOUDFLARE_GITHUB_APP_DATABASE_ID ||
      suite.data.app.slug !== CLOUDFLARE_GITHUB_APP_SLUG
    ) {
      return { scan: null, availablePullRequestIds: [] };
    }
    const next = normalizeGitHubCloudflareCheckRunPage(suite.data.checkRuns, scan, scan);
    if (next === null) {
      return { scan: null, availablePullRequestIds: [] };
    }
    scan = next;
  }
  return { scan, availablePullRequestIds };
}

export async function readGitHubCloudflareWorkerChecks(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  heads: readonly CloudflareWorkerCheckPullRequest[];
}): Promise<Map<string, CloudflareWorkerProofRead>> {
  const reads = new Map<string, CloudflareWorkerProofRead>();
  const headsById = new Map(args.heads.map((head) => [head.id, head]));
  const commitsById = new Map<string, { pullRequestIds: Set<string>; commit: PullRequestCommit }>();
  const checkRunsByCommitId = new Map<string, CloudflareWorkerCheckRunInput[]>();
  for (const head of args.heads) {
    if (head.commitScan.state === "unavailable") {
      reads.set(head.id, { state: "unavailable" });
      continue;
    }
    for (const commit of head.commitScan.commits) {
      const previous = commitsById.get(commit.id);
      if (previous) {
        if (previous.commit.oid !== commit.oid) {
          reads.set(head.id, { state: "unavailable" });
          for (const pullRequestId of previous.pullRequestIds) {
            reads.set(pullRequestId, { state: "unavailable" });
          }
        } else {
          previous.pullRequestIds.add(head.id);
        }
        continue;
      }
      commitsById.set(commit.id, { pullRequestIds: new Set([head.id]), commit });
      checkRunsByCommitId.set(commit.id, []);
    }
  }

  const continuations: {
    scan: CloudflareCheckRunScan;
    pullRequestIds: string[];
  }[] = [];
  const commitRequests = [...commitsById.values()];
  for (let offset = 0; offset < commitRequests.length; offset += GITHUB_CHECK_RUN_PAGE_SIZE) {
    const chunk = commitRequests.slice(offset, offset + GITHUB_CHECK_RUN_PAGE_SIZE);
    const pullRequestIds = [...new Set(chunk.flatMap((request) => [...request.pullRequestIds]))];
    let response: unknown;
    try {
      response = await args.octokit.graphql(PULL_REQUEST_CLOUDFLARE_CHECKS_QUERY, {
        commitIds: chunk.map(({ commit }) => commit.id),
        pullRequestIds,
        request: { signal: args.signal },
      });
    } catch (error) {
      try {
        response = recoverGitHubCloudflareCheckData(error);
      } catch {
        for (const pullRequestId of pullRequestIds) {
          reads.set(pullRequestId, { state: "unavailable" });
        }
        continue;
      }
    }
    const batch = providerCloudflareCheckBatchSchema.safeParse(response);
    if (
      !batch.success ||
      batch.data.commits.length !== chunk.length ||
      batch.data.pullRequests.length !== pullRequestIds.length
    ) {
      for (const pullRequestId of pullRequestIds) {
        reads.set(pullRequestId, { state: "unavailable" });
      }
      continue;
    }

    batch.data.pullRequests.forEach((value, index) => {
      const pullRequestId = pullRequestIds[index];
      const head = headsById.get(pullRequestId);
      if (!head || !matchesCloudflareCheckPullRequest({ value, head, ghRepoId: args.ghRepoId })) {
        reads.set(pullRequestId, { state: "unavailable" });
      }
    });
    batch.data.commits.forEach((value, index) => {
      const request = chunk[index];
      const availablePullRequestIds = [...request.pullRequestIds].filter(
        (pullRequestId) => reads.get(pullRequestId)?.state !== "unavailable",
      );
      if (availablePullRequestIds.length === 0) {
        return;
      }
      const commit = providerCloudflareCommitCheckSchema.safeParse(value);
      if (
        !commit.success ||
        commit.data.id !== request.commit.id ||
        commit.data.oid !== request.commit.oid ||
        commit.data.checkSuites.totalCount !== commit.data.checkSuites.nodes.length ||
        commit.data.checkSuites.totalCount > 1
      ) {
        for (const pullRequestId of availablePullRequestIds) {
          reads.set(pullRequestId, { state: "unavailable" });
        }
        return;
      }
      const suite = commit.data.checkSuites.nodes.at(0);
      if (!suite) {
        return;
      }
      if (
        suite.app.databaseId !== CLOUDFLARE_GITHUB_APP_DATABASE_ID ||
        suite.app.slug !== CLOUDFLARE_GITHUB_APP_SLUG
      ) {
        for (const pullRequestId of availablePullRequestIds) {
          reads.set(pullRequestId, { state: "unavailable" });
        }
        return;
      }
      const scan = normalizeGitHubCloudflareCheckRunPage(suite.checkRuns, {
        commitId: request.commit.id,
        suiteId: suite.id,
      });
      if (scan === null) {
        for (const pullRequestId of availablePullRequestIds) {
          reads.set(pullRequestId, { state: "unavailable" });
        }
        return;
      }
      checkRunsByCommitId.set(request.commit.id, scan.checkRuns);
      if (scan.after !== null) {
        continuations.push({ scan, pullRequestIds: availablePullRequestIds });
      }
    });
  }

  const completedScans =
    continuations.length === 0
      ? []
      : await allLimited(
          continuations.map((continuation) => async () => {
            return await completeGitHubCloudflareCheckRunScan({
              octokit: args.octokit,
              signal: args.signal,
              ghRepoId: args.ghRepoId,
              scan: continuation.scan,
              headsById,
              pullRequestIds: continuation.pullRequestIds,
            });
          }),
          6,
        );
  completedScans.forEach((result, index) => {
    const initial = continuations[index];
    const availablePullRequestIds = new Set(result.availablePullRequestIds);
    for (const pullRequestId of initial.pullRequestIds) {
      if (!availablePullRequestIds.has(pullRequestId)) {
        reads.set(pullRequestId, { state: "unavailable" });
      }
    }
    if (result.scan !== null) {
      checkRunsByCommitId.set(result.scan.commitId, result.scan.checkRuns);
    }
  });

  for (const head of args.heads) {
    if (reads.get(head.id)?.state === "unavailable" || head.commitScan.state === "unavailable") {
      reads.set(head.id, { state: "unavailable" });
      continue;
    }
    const commits: CloudflareCommitCheckRuns[] = head.commitScan.commits.map((commit) => ({
      checkRuns: checkRunsByCommitId.get(commit.id) ?? [],
    }));
    reads.set(head.id, resolveCloudflareWorkerCheckRuns(commits));
  }
  return reads;
}
