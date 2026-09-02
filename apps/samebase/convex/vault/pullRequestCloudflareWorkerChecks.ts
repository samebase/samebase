"use node";

import type { Octokit } from "@octokit/rest";
import { z } from "zod";

import {
  normalizeCloudflareWorkerPreviewUrl,
  parseCloudflareWorkerBuildLogsUrl,
  parseCloudflareWorkerScriptUrl,
} from "../../shared/cloudflareResourceUrls";
import { allLimited } from "../common";
import type { CloudflareBuildState } from "./cloudflareBuildMatching";
import type {
  CloudflareWorkerProof,
  CloudflareWorkerProofRead,
} from "./pullRequestCloudflareWorkerProof";

const CLOUDFLARE_GITHUB_APP_DATABASE_ID = 85455;
const CLOUDFLARE_GITHUB_APP_SLUG = "cloudflare-workers-and-pages";
const GITHUB_NODE_PAGE_SIZE = 100;

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

export type CloudflareWorkerCheckPullRequest = {
  id: string;
  baseRefOid: string;
  headRefOid: string;
  headRefName: string;
  commits: readonly { id: string; oid: string }[];
};

const gitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const checkRunSchema = z.object({
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
const checkRunConnectionSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().min(1).nullable(),
  }),
  nodes: z.array(checkRunSchema).max(GITHUB_NODE_PAGE_SIZE),
});
const checkSuiteSchema = z.object({
  __typename: z.literal("CheckSuite"),
  id: z.string().min(1),
  app: z.object({
    databaseId: z.number().int().positive(),
    slug: z.string().min(1),
  }),
  branch: z.object({ name: z.string().min(1), prefix: z.string().min(1) }).nullable(),
  checkRuns: checkRunConnectionSchema,
});
const commitSchema = z.object({
  __typename: z.literal("Commit"),
  id: z.string().min(1),
  oid: gitObjectIdSchema,
  checkSuites: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(checkSuiteSchema).max(1),
  }),
});
const checkBatchSchema = z.object({ commits: z.array(z.unknown()) });
const checkRunPageSchema = z.object({ suite: z.unknown() });
const pullRequestGenerationSchema = z.object({
  __typename: z.literal("PullRequest"),
  id: z.string().min(1),
  state: z.literal("OPEN"),
  repository: z.object({ databaseId: z.number().int().positive() }),
  baseRefOid: gitObjectIdSchema,
  headRefOid: gitObjectIdSchema,
  headRefName: z.string().min(1),
});
const pullRequestGenerationsSchema = z.object({ pullRequests: z.array(z.unknown()) });

const CHECKS_QUERY = `
  query PullRequestCloudflareChecks($commitIds: [ID!]!) {
    commits: nodes(ids: $commitIds) {
      __typename
      ... on Commit {
        id
        oid
        checkSuites(first: 1, filterBy: { appId: ${CLOUDFLARE_GITHUB_APP_DATABASE_ID} }) {
          totalCount
          nodes {
            __typename
            id
            app { databaseId slug }
            branch { name prefix }
            checkRuns(first: ${GITHUB_NODE_PAGE_SIZE}, filterBy: { checkType: LATEST }) {
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
  }
`;

const CHECK_RUN_PAGE_QUERY = `
  query PullRequestCloudflareCheckRunPage($suiteId: ID!, $after: String) {
    suite: node(id: $suiteId) {
      __typename
      ... on CheckSuite {
        id
        app { databaseId slug }
        branch { name prefix }
        checkRuns(
          first: ${GITHUB_NODE_PAGE_SIZE}
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
  }
`;

const PULL_REQUEST_GENERATIONS_QUERY = `
  query PullRequestCloudflareCheckGenerations($pullRequestIds: [ID!]!) {
    pullRequests: nodes(ids: $pullRequestIds) {
      __typename
      ... on PullRequest {
        id
        state
        repository { databaseId }
        baseRefOid
        headRefOid
        headRefName
      }
    }
  }
`;

function checkRunBuildState(status: string, conclusion: string | null): CloudflareBuildState {
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
    default:
      return "unknown";
  }
}

function summaryFields(summary: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (const line of summary.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z ]+):\s*(.+)$/);
    if (match === null) {
      continue;
    }
    if (fields.has(match[1])) {
      return null;
    }
    fields.set(match[1], match[2]);
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

function parseWorkerCheckRun(
  checkRun: CloudflareWorkerCheckRunInput,
): CloudflareWorkerProof | null | "unavailable" {
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

  const logs = parseCloudflareWorkerBuildLogsUrl(checkRun.detailsUrl);
  const fields = summaryFields(checkRun.summary);
  const buildLink = fields === null ? null : markdownLink(fields.get("Build ID") ?? "");
  const scriptLink = fields === null ? null : markdownLink(fields.get("Script") ?? "");
  const script = scriptLink === null ? null : parseCloudflareWorkerScriptUrl(scriptLink.url);
  if (
    logs === null ||
    fields === null ||
    buildLink === null ||
    scriptLink === null ||
    script === null ||
    workerName !== logs.workerName ||
    workerName !== scriptLink.label ||
    workerName !== script.workerName ||
    logs.accountId !== script.accountId ||
    !/^[0-9a-f]{32}$/.test(logs.accountId) ||
    !isUuid(logs.buildUuid) ||
    checkRun.externalId !== logs.buildUuid ||
    buildLink.label !== logs.buildUuid ||
    buildLink.url !== checkRun.detailsUrl
  ) {
    return "unavailable";
  }

  const versionId = fields.get("Version ID");
  const preview = fields.get("Preview URL");
  const alias = fields.get("Preview Alias URL");
  if (versionId !== undefined && !isUuid(versionId)) {
    return "unavailable";
  }

  const normalizedPreview =
    preview === undefined ? null : normalizeCloudflareWorkerPreviewUrl(preview, workerName);
  const normalizedAlias =
    alias === undefined ? null : normalizeCloudflareWorkerPreviewUrl(alias, workerName);
  if (
    (preview !== undefined && normalizedPreview === null) ||
    (alias !== undefined && normalizedAlias === null) ||
    (normalizedPreview !== null &&
      versionId !== undefined &&
      !new URL(normalizedPreview.url).hostname.startsWith(
        `${versionId.slice(0, 8).toLowerCase()}-`,
      )) ||
    (normalizedPreview !== null &&
      normalizedAlias !== null &&
      normalizedPreview.zone !== normalizedAlias.zone)
  ) {
    return "unavailable";
  }

  return {
    accountId: logs.accountId,
    buildUuid: logs.buildUuid,
    buildState: checkRunBuildState(checkRun.status, checkRun.conclusion),
    logsUrl: checkRun.detailsUrl,
    name: workerName,
    preview:
      normalizedAlias === null
        ? { state: "absent" }
        : { state: "available", url: normalizedAlias.url, provenance: "selected_result" },
  };
}

export function resolveCloudflareWorkerCheckRuns(args: {
  commits: readonly {
    checkRuns: readonly CloudflareWorkerCheckRunInput[];
    branch: { name: string; prefix: string } | null;
  }[];
  currentHeadBranch: string;
}): CloudflareWorkerProofRead {
  const selected = new Map<string, CloudflareWorkerProof>();
  for (const commit of [...args.commits].reverse()) {
    const current = new Map<string, CloudflareWorkerProof>();
    for (const checkRun of commit.checkRuns) {
      const worker = parseWorkerCheckRun(checkRun);
      if (worker === "unavailable") {
        return { state: "unavailable" };
      }
      if (worker === null) {
        continue;
      }
      const identity = `${worker.accountId}:${worker.name}`;
      if (current.has(identity)) {
        return { state: "unavailable" };
      }
      current.set(identity, worker);
    }
    for (const [identity, worker] of current) {
      const previous = selected.get(identity);
      if (previous === undefined) {
        selected.set(identity, worker);
      } else if (
        previous.preview.state === "absent" &&
        (previous.buildState === "queued" || previous.buildState === "running") &&
        worker.buildState === "success" &&
        worker.preview.state === "available" &&
        commit.branch?.name === args.currentHeadBranch &&
        commit.branch.prefix === "refs/heads/"
      ) {
        selected.set(identity, {
          ...previous,
          preview: { ...worker.preview, provenance: "earlier_check" },
        });
      }
    }
  }

  return {
    state: "available",
    workers: [...selected.values()].sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.accountId.localeCompare(right.accountId) ||
        left.buildUuid.localeCompare(right.buildUuid),
    ),
  };
}

type CheckRunScan = {
  commitId: string;
  suiteId: string;
  checkRuns: CloudflareWorkerCheckRunInput[];
  totalCount: number;
  after: string | null;
  branch: { name: string; prefix: string } | null;
};

function extendCheckRunScan(
  value: unknown,
  identity: Pick<CheckRunScan, "commitId" | "suiteId" | "branch">,
  previous?: CheckRunScan,
): CheckRunScan | null {
  const page = checkRunConnectionSchema.safeParse(value);
  if (!page.success || (previous && page.data.totalCount !== previous.totalCount)) {
    return null;
  }
  const checkRuns = [...(previous?.checkRuns ?? [])];
  const seen = new Set(checkRuns.map((checkRun) => checkRun.id));
  for (const checkRun of page.data.nodes) {
    if (seen.has(checkRun.id)) {
      return null;
    }
    seen.add(checkRun.id);
    checkRuns.push(checkRun);
  }
  const { endCursor, hasNextPage } = page.data.pageInfo;
  if (
    checkRuns.length > page.data.totalCount ||
    (hasNextPage &&
      (endCursor === null ||
        endCursor === previous?.after ||
        page.data.nodes.length === 0 ||
        checkRuns.length === page.data.totalCount)) ||
    (!hasNextPage && checkRuns.length !== page.data.totalCount)
  ) {
    return null;
  }
  return {
    ...identity,
    checkRuns,
    totalCount: page.data.totalCount,
    after: hasNextPage ? endCursor : null,
    branch: identity.branch,
  };
}

async function completeCheckRunScan(args: {
  octokit: Octokit;
  signal: AbortSignal;
  scan: CheckRunScan;
}): Promise<CheckRunScan | null> {
  let scan = args.scan;
  while (scan.after !== null) {
    let response: unknown;
    try {
      response = await args.octokit.graphql(CHECK_RUN_PAGE_QUERY, {
        suiteId: scan.suiteId,
        after: scan.after,
        request: { signal: args.signal },
      });
    } catch {
      return null;
    }
    const page = checkRunPageSchema.safeParse(response);
    const suite = page.success ? checkSuiteSchema.safeParse(page.data.suite) : null;
    if (
      suite === null ||
      !suite.success ||
      suite.data.id !== scan.suiteId ||
      suite.data.branch?.name !== scan.branch?.name ||
      suite.data.branch?.prefix !== scan.branch?.prefix ||
      suite.data.app.databaseId !== CLOUDFLARE_GITHUB_APP_DATABASE_ID ||
      suite.data.app.slug !== CLOUDFLARE_GITHUB_APP_SLUG
    ) {
      return null;
    }
    const next = extendCheckRunScan(suite.data.checkRuns, scan, scan);
    if (next === null) {
      return null;
    }
    scan = next;
  }
  return scan;
}

async function currentPullRequestIds(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  heads: readonly CloudflareWorkerCheckPullRequest[];
}): Promise<Set<string>> {
  let response: unknown;
  try {
    response = await args.octokit.graphql(PULL_REQUEST_GENERATIONS_QUERY, {
      pullRequestIds: args.heads.map((head) => head.id),
      request: { signal: args.signal },
    });
  } catch {
    return new Set();
  }
  const generations = pullRequestGenerationsSchema.safeParse(response);
  if (!generations.success || generations.data.pullRequests.length !== args.heads.length) {
    return new Set();
  }
  return new Set(
    args.heads.flatMap((head, index) => {
      const generation = pullRequestGenerationSchema.safeParse(
        generations.data.pullRequests[index],
      );
      return generation.success &&
        generation.data.id === head.id &&
        String(generation.data.repository.databaseId) === args.ghRepoId &&
        generation.data.baseRefOid === head.baseRefOid &&
        generation.data.headRefOid === head.headRefOid &&
        generation.data.headRefName === head.headRefName
        ? [head.id]
        : [];
    }),
  );
}

export async function readGitHubCloudflareWorkerChecks(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  heads: readonly CloudflareWorkerCheckPullRequest[];
}): Promise<Map<string, CloudflareWorkerProofRead>> {
  if (args.heads.length === 0) {
    return new Map();
  }

  const commitsById = new Map<string, { id: string; oid: string }>();
  const failedCommitIds = new Set<string>();
  const checkRunsByCommitId = new Map<string, CheckRunScan | null>();
  for (const head of args.heads) {
    for (const commit of head.commits) {
      const existing = commitsById.get(commit.id);
      if (existing && existing.oid !== commit.oid) {
        failedCommitIds.add(commit.id);
      } else if (!existing) {
        commitsById.set(commit.id, commit);
      }
    }
  }

  const continuations: CheckRunScan[] = [];
  const commitRequests = [...commitsById.values()];
  for (let offset = 0; offset < commitRequests.length; offset += GITHUB_NODE_PAGE_SIZE) {
    const chunk = commitRequests.slice(offset, offset + GITHUB_NODE_PAGE_SIZE);
    let response: unknown;
    try {
      response = await args.octokit.graphql(CHECKS_QUERY, {
        commitIds: chunk.map((commit) => commit.id),
        request: { signal: args.signal },
      });
    } catch {
      for (const commit of chunk) {
        failedCommitIds.add(commit.id);
      }
      continue;
    }

    const batch = checkBatchSchema.safeParse(response);
    if (!batch.success || batch.data.commits.length !== chunk.length) {
      for (const commit of chunk) {
        failedCommitIds.add(commit.id);
      }
      continue;
    }

    batch.data.commits.forEach((value, index) => {
      const request = chunk[index];
      const commit = commitSchema.safeParse(value);
      if (
        !commit.success ||
        commit.data.id !== request.id ||
        commit.data.oid !== request.oid ||
        commit.data.checkSuites.totalCount !== commit.data.checkSuites.nodes.length ||
        commit.data.checkSuites.totalCount > 1
      ) {
        failedCommitIds.add(request.id);
        return;
      }

      const suite = commit.data.checkSuites.nodes.at(0);
      if (suite === undefined) {
        checkRunsByCommitId.set(request.id, null);
        return;
      }
      if (
        suite.app.databaseId !== CLOUDFLARE_GITHUB_APP_DATABASE_ID ||
        suite.app.slug !== CLOUDFLARE_GITHUB_APP_SLUG
      ) {
        failedCommitIds.add(request.id);
        return;
      }

      const scan = extendCheckRunScan(suite.checkRuns, {
        commitId: request.id,
        suiteId: suite.id,
        branch: suite.branch,
      });
      if (scan === null) {
        failedCommitIds.add(request.id);
        return;
      }
      checkRunsByCommitId.set(request.id, scan);
      if (scan.after !== null) {
        continuations.push(scan);
      }
    });
  }

  const completed =
    continuations.length === 0
      ? []
      : await allLimited(
          continuations.map(
            (scan) => async () =>
              await completeCheckRunScan({
                octokit: args.octokit,
                signal: args.signal,
                scan,
              }),
          ),
          6,
        );
  completed.forEach((scan, index) => {
    if (scan === null) {
      failedCommitIds.add(continuations[index].commitId);
    } else {
      checkRunsByCommitId.set(scan.commitId, scan);
    }
  });

  const currentIds = await currentPullRequestIds(args);
  return new Map(
    args.heads.map((head) => [
      head.id,
      !currentIds.has(head.id) || head.commits.some((commit) => failedCommitIds.has(commit.id))
        ? { state: "unavailable" }
        : resolveCloudflareWorkerCheckRuns({
            commits: head.commits.map((commit) => {
              const scan = checkRunsByCommitId.get(commit.id);
              return {
                checkRuns: scan?.checkRuns ?? [],
                branch: scan?.branch ?? null,
              };
            }),
            currentHeadBranch: head.headRefName,
          }),
    ]),
  );
}
