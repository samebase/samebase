import { describe, expect, it } from "vite-plus/test";

import {
  collectRepositoryInventory,
  type RepositoryInventoryGraphqlPartialRequest,
  type RepositoryInventoryGraphqlRequest,
} from "./githubRepositoryInventory";

type FixtureCheckRunState =
  | "ACTION_REQUIRED"
  | "CANCELLED"
  | "COMPLETED"
  | "FAILURE"
  | "IN_PROGRESS"
  | "NEUTRAL"
  | "PENDING"
  | "QUEUED"
  | "SKIPPED"
  | "STALE"
  | "STARTUP_FAILURE"
  | "SUCCESS"
  | "TIMED_OUT"
  | "WAITING";

type FixtureStatusContextState = "ERROR" | "EXPECTED" | "FAILURE" | "PENDING" | "SUCCESS";

type FixtureCloudflareCheckRun = {
  id: string;
  name: string;
  status?: string;
  conclusion?: string | null;
  detailsUrl?: string | null;
  url?: string | null;
  summary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type FixtureCloudflareCheckSuite = {
  id: string;
  branchName: string | null;
  checkRuns: FixtureCloudflareCheckRun[];
  totalCount?: number;
};

type FixtureCheckEvidence = {
  checkCount: number;
  statusContextCount?: number;
  rollupState?: "ERROR" | "EXPECTED" | "FAILURE" | "PENDING" | "SUCCESS";
  checkRunCountsByState?: Array<{ state: FixtureCheckRunState; count: number }>;
  statusContextCountsByState?: Array<{ state: FixtureStatusContextState; count: number }>;
  cloudflareSuites?: FixtureCloudflareCheckSuite[];
  cloudflareSuiteTotalCount?: number;
};

type FixtureBranch = FixtureCheckEvidence & {
  id: string;
  commitNodeId?: string;
  name: string;
  sha: string;
  aheadBy?: number;
  behindBy?: number;
  comparisonUnavailable?: boolean;
};

type FixturePullRequest = FixtureCheckEvidence & {
  id: string;
  commitNodeId?: string;
  number: number;
  title: string;
  headRefName: string;
  headRefOid: string;
  headRepositoryId: string;
  headRepositoryFullName: string;
  isDraft: boolean;
  isCrossRepository: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  labelCount: number;
  updatedAt: string;
  baseRefName?: string;
  aheadBy?: number;
  behindBy?: number;
  baseRefAvailable?: boolean;
  headRepositoryAvailable?: boolean;
  headRefAvailable?: boolean;
  comparisonUnavailable?: boolean;
  comparisonHeadTargetOid?: string;
  comparisonError?: {
    message: string;
    type: string;
    path?: Array<string | number>;
  };
};

type RepositoryFixture = {
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  branches: FixtureBranch[];
  verificationBranches?: FixtureBranch[];
  pullRequests: FixturePullRequest[];
  verificationPullRequests?: FixturePullRequest[];
  branchPageWidth?: number;
  branchVerificationPageWidth?: number;
  pullRequestPageWidth?: number;
  pullRequestVerificationPageWidth?: number;
  transformCloudflareBatch?: (args: {
    commitIds: readonly string[];
    nodes: readonly unknown[];
    pass: "initial" | "verification";
  }) => unknown[];
};

type RequestObservations = {
  branchPageSizes: number[];
  cloudflareCommitBatchIds: string[][];
  pullRequestComparisonBatchSizes: number[];
  branchVerificationPasses: number;
  pullRequestVerificationPasses: number;
  requestedRepositoryIds: string[];
  cloudflareSuiteContinuationRequests: number;
  cloudflareCheckRunContinuationRequests: number;
};

type TransformCloudflareBatch = NonNullable<RepositoryFixture["transformCloudflareBatch"]>;

function pageInfo(hasNextPage: boolean, endCursor: string | null) {
  return { hasNextPage, endCursor };
}

function requireStringVariable(
  variables: Parameters<RepositoryInventoryGraphqlRequest>[1],
  name: string,
): string {
  const value = variables[name];
  if (typeof value !== "string") {
    throw new Error(`Expected ${name} to be a string.`);
  }
  return value;
}

function requireNumberVariable(
  variables: Parameters<RepositoryInventoryGraphqlRequest>[1],
  name: string,
): number {
  const value = variables[name];
  if (typeof value !== "number") {
    throw new Error(`Expected ${name} to be a number.`);
  }
  return value;
}

function requireStringArrayVariable(
  variables: Parameters<RepositoryInventoryGraphqlRequest>[1],
  name: string,
): string[] {
  const value = variables[name];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Expected ${name} to be a string array.`);
  }
  return value;
}

function readCursor(
  variables: Parameters<RepositoryInventoryGraphqlRequest>[1],
  prefix: string,
): number {
  const value = variables.after;
  if (value === null) {
    return 0;
  }
  if (typeof value !== "string" || !value.startsWith(`${prefix}:`)) {
    throw new Error(`Expected a ${prefix} cursor.`);
  }
  const position = Number(value.slice(prefix.length + 1));
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new Error(`Expected a valid ${prefix} cursor.`);
  }
  return position;
}

function slicePage<Value>(args: {
  values: readonly Value[];
  start: number;
  width: number;
  cursorPrefix: string;
}) {
  const end = Math.min(args.start + args.width, args.values.length);
  return {
    nodes: args.values.slice(args.start, end),
    pageInfo: pageInfo(
      end < args.values.length,
      end < args.values.length ? `${args.cursorPrefix}:${end}` : null,
    ),
  };
}

const CHECK_RUN_STATES: readonly FixtureCheckRunState[] = [
  "ACTION_REQUIRED",
  "CANCELLED",
  "COMPLETED",
  "FAILURE",
  "IN_PROGRESS",
  "NEUTRAL",
  "PENDING",
  "QUEUED",
  "SKIPPED",
  "STALE",
  "STARTUP_FAILURE",
  "SUCCESS",
  "TIMED_OUT",
  "WAITING",
];

const STATUS_CONTEXT_STATES: readonly FixtureStatusContextState[] = [
  "EXPECTED",
  "ERROR",
  "FAILURE",
  "PENDING",
  "SUCCESS",
];

function aggregateCheckRunState(
  rollupState: FixtureCheckEvidence["rollupState"],
): FixtureCheckRunState {
  switch (rollupState) {
    case "ERROR":
    case "FAILURE":
      return "FAILURE";
    case "EXPECTED":
    case "PENDING":
      return "PENDING";
    case "SUCCESS":
    case undefined:
      return "SUCCESS";
    default: {
      rollupState satisfies never;
      return "COMPLETED";
    }
  }
}

function aggregateStatusContextState(
  rollupState: FixtureCheckEvidence["rollupState"],
): FixtureStatusContextState {
  switch (rollupState) {
    case "ERROR":
      return "ERROR";
    case "EXPECTED":
      return "EXPECTED";
    case "FAILURE":
      return "FAILURE";
    case "PENDING":
      return "PENDING";
    case "SUCCESS":
    case undefined:
      return "SUCCESS";
    default: {
      rollupState satisfies never;
      return "PENDING";
    }
  }
}

function makeCheckCounts(args: FixtureCheckEvidence) {
  const statusContextCount = args.statusContextCount ?? 0;
  if (statusContextCount > args.checkCount) {
    throw new Error("Status context fixture count exceeds its total check count.");
  }
  const checkRunCount = args.checkCount - statusContextCount;
  const checkRunState = aggregateCheckRunState(args.rollupState);
  const statusContextState = aggregateStatusContextState(args.rollupState);
  return {
    totalCount: args.checkCount,
    checkRunCount,
    statusContextCount,
    checkRunCountsByState:
      args.checkRunCountsByState ??
      CHECK_RUN_STATES.map((state) => ({
        state,
        count: state === checkRunState ? checkRunCount : 0,
      })),
    statusContextCountsByState:
      args.statusContextCountsByState ??
      STATUS_CONTEXT_STATES.map((state) => ({
        state,
        count: state === statusContextState ? statusContextCount : 0,
      })),
  };
}

function makeCloudflareCheckRun(run: FixtureCloudflareCheckRun) {
  return {
    id: run.id,
    name: run.name,
    status: run.status ?? "COMPLETED",
    conclusion: run.conclusion === undefined ? "SUCCESS" : run.conclusion,
    detailsUrl: run.detailsUrl ?? `https://dash.cloudflare.com/builds/${run.id}`,
    url: run.url ?? `https://github.com/checks/${run.id}`,
    summary: run.summary ?? null,
    startedAt: run.startedAt ?? "2026-07-15T10:00:00Z",
    completedAt: run.completedAt ?? "2026-07-15T10:01:00Z",
  };
}

function makeCloudflareCheckRunPage(suite: FixtureCloudflareCheckSuite, start: number) {
  const end = Math.min(start + 100, suite.checkRuns.length);
  return {
    totalCount: suite.totalCount ?? suite.checkRuns.length,
    pageInfo: pageInfo(
      end < suite.checkRuns.length,
      end < suite.checkRuns.length ? `cloudflare-runs-${suite.id}:${end}` : null,
    ),
    nodes: suite.checkRuns.slice(start, end).map(makeCloudflareCheckRun),
  };
}

function makeCloudflareSuitePage(args: {
  commitNodeId: string;
  suites: readonly FixtureCloudflareCheckSuite[];
  totalCount?: number;
  start: number;
  width: number;
}) {
  const end = Math.min(args.start + args.width, args.suites.length);
  return {
    totalCount: args.totalCount ?? args.suites.length,
    pageInfo: pageInfo(
      end < args.suites.length,
      end < args.suites.length ? `cloudflare-suites-${args.commitNodeId}:${end}` : null,
    ),
    nodes: args.suites.slice(args.start, end).map((suite) => ({
      id: suite.id,
      branch: suite.branchName === null ? null : { name: suite.branchName },
      checkRuns: makeCloudflareCheckRunPage(suite, 0),
    })),
  };
}

function fixtureCommitNodeId(repositoryId: string, sha: string): string {
  return `COMMIT:${repositoryId}:${sha}`;
}

function makeWorkerBuild(args: {
  id: string;
  workerName: string;
  versionUrl?: string;
  branchAliasUrl?: string;
  status?: string;
  conclusion?: string | null;
  summarySuffix?: string;
}): FixtureCloudflareCheckRun {
  const versionUrl = args.versionUrl ?? `https://${args.id}.workers.dev/`;
  const branchAliasLine = args.branchAliasUrl
    ? `\nPreview Alias URL: [Preview Alias](${args.branchAliasUrl})`
    : "";
  return {
    id: args.id,
    name: `Workers Builds: ${args.workerName}`,
    status: args.status,
    conclusion: args.conclusion,
    summary: `Build ID: [build-${args.id}](https://dash.cloudflare.com/builds/${args.id})
Script: [${args.workerName}](https://dash.cloudflare.com/workers/${args.workerName})
Version ID: [version-${args.id}](https://dash.cloudflare.com/versions/${args.id})
Preview URL: [Preview](${versionUrl})${branchAliasLine}${args.summarySuffix ?? ""}`,
  };
}

function makeCommit(
  args: FixtureCheckEvidence & {
    nodeId?: string;
    sha: string;
    repositoryId: string;
  },
) {
  return {
    id: args.nodeId ?? fixtureCommitNodeId(args.repositoryId, args.sha),
    oid: args.sha,
    messageHeadline: `Commit ${args.sha}`,
    authoredDate: "2026-07-15T09:59:00Z",
    committedDate: "2026-07-15T10:00:00Z",
    repository: { id: args.repositoryId },
    statusCheckRollup:
      args.checkCount === 0
        ? null
        : {
            state: args.rollupState ?? "SUCCESS",
            contexts: makeCheckCounts(args),
          },
  };
}

function makeLabel(position: number) {
  return {
    name: `label-${position}`,
    color: position % 2 === 0 ? "ff0000" : "00ff00",
  };
}

function makeLabelPage(pullRequest: FixturePullRequest, start: number) {
  const end = Math.min(start + 100, pullRequest.labelCount);
  return {
    totalCount: pullRequest.labelCount,
    pageInfo: pageInfo(
      end < pullRequest.labelCount,
      end < pullRequest.labelCount ? `label-${pullRequest.id}:${end}` : null,
    ),
    nodes: Array.from({ length: end - start }, (_, index) => makeLabel(start + index)),
  };
}

function makeBranchNode(fixture: RepositoryFixture, branch: FixtureBranch) {
  const defaultBranchSha = fixture.branches.find(
    (candidate) => candidate.name === fixture.defaultBranch,
  )?.sha;
  if (defaultBranchSha === undefined) {
    throw new Error("Expected a default branch fixture.");
  }
  return {
    id: branch.id,
    name: branch.name,
    target: {
      __typename: "Commit",
      ...makeCommit({
        ...branch,
        nodeId: branch.commitNodeId,
        sha: branch.sha,
        repositoryId: fixture.repositoryId,
      }),
    },
    comparison: branch.comparisonUnavailable
      ? null
      : {
          aheadBy: branch.behindBy ?? 0,
          behindBy: branch.aheadBy ?? 0,
          baseTarget: { oid: branch.sha },
          headTarget: { oid: defaultBranchSha },
        },
  };
}

function makeCheckRollupSignature(args: FixtureCheckEvidence) {
  return args.checkCount === 0
    ? null
    : {
        state: args.rollupState ?? "SUCCESS",
        contexts: makeCheckCounts(args),
      };
}

function makeBranchSignatureNode(repositoryId: string, branch: FixtureBranch) {
  return {
    name: branch.name,
    target: {
      id: branch.commitNodeId ?? fixtureCommitNodeId(repositoryId, branch.sha),
      oid: branch.sha,
      repository: { id: repositoryId },
      statusCheckRollup: makeCheckRollupSignature(branch),
    },
  };
}

function makePullRequestSignatureNode(
  repositoryId: string,
  defaultBranch: string | null,
  pullRequest: FixturePullRequest,
) {
  const baseRefName = pullRequest.baseRefName ?? defaultBranch;
  if (baseRefName === null) {
    throw new Error("Expected a pull request base branch fixture.");
  }
  return {
    id: pullRequest.id,
    updatedAt: pullRequest.updatedAt,
    baseRefName,
    headRefName: pullRequest.headRefName,
    headRefOid: pullRequest.headRefOid,
    headRepository:
      pullRequest.headRepositoryAvailable === false
        ? null
        : {
            id: pullRequest.headRepositoryId,
            nameWithOwner: pullRequest.headRepositoryFullName,
            owner: { login: pullRequest.headRepositoryFullName.split("/")[0] },
          },
    commits: {
      nodes: [
        {
          commit: {
            id:
              pullRequest.commitNodeId ?? fixtureCommitNodeId(repositoryId, pullRequest.headRefOid),
            oid: pullRequest.headRefOid,
            repository: { id: repositoryId },
            statusCheckRollup: makeCheckRollupSignature(pullRequest),
          },
        },
      ],
    },
  };
}

function makePullRequestNode(fixture: RepositoryFixture, pullRequest: FixturePullRequest) {
  return {
    id: pullRequest.id,
    number: pullRequest.number,
    title: pullRequest.title,
    url: `https://github.com/${fixture.repositoryFullName}/pull/${pullRequest.number}`,
    isDraft: pullRequest.isDraft,
    isCrossRepository: pullRequest.isCrossRepository,
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    changedFiles: pullRequest.changedFiles,
    createdAt: "2026-07-14T10:00:00Z",
    updatedAt: pullRequest.updatedAt,
    baseRefName: pullRequest.baseRefName ?? fixture.defaultBranch,
    headRefName: pullRequest.headRefName,
    headRefOid: pullRequest.headRefOid,
    headRepository:
      pullRequest.headRepositoryAvailable === false
        ? null
        : {
            id: pullRequest.headRepositoryId,
            nameWithOwner: pullRequest.headRepositoryFullName,
            owner: { login: pullRequest.headRepositoryFullName.split("/")[0] },
          },
    labels: makeLabelPage(pullRequest, 0),
    commits: {
      nodes: [
        {
          commit: makeCommit({
            ...pullRequest,
            nodeId: pullRequest.commitNodeId,
            sha: pullRequest.headRefOid,
            repositoryId: fixture.repositoryId,
          }),
        },
      ],
    },
  };
}

type FixtureCommitObservation = {
  nodeId: string;
  repositoryId: string;
  sha: string;
  suites: FixtureCloudflareCheckSuite[];
  suiteTotalCount?: number;
};

function buildFixtureCommitObservations(args: {
  repositoryId: string;
  branches: readonly FixtureBranch[];
  pullRequests: readonly FixturePullRequest[];
}): ReadonlyMap<string, FixtureCommitObservation> {
  const observations = new Map<string, FixtureCommitObservation>();
  const append = (args: {
    nodeId: string;
    repositoryId: string;
    sha: string;
    evidence: FixtureCheckEvidence;
  }): void => {
    const { nodeId } = args;
    const existing = observations.get(nodeId);
    if (existing === undefined) {
      observations.set(nodeId, {
        nodeId,
        repositoryId: args.repositoryId,
        sha: args.sha,
        suites: [...(args.evidence.cloudflareSuites ?? [])],
        suiteTotalCount: args.evidence.cloudflareSuiteTotalCount,
      });
      return;
    }
    const suites = [...existing.suites];
    for (const suite of args.evidence.cloudflareSuites ?? []) {
      const repeated = suites.find((candidate) => candidate.id === suite.id);
      if (repeated !== undefined && JSON.stringify(repeated) !== JSON.stringify(suite)) {
        throw new Error(`Fixture commit ${nodeId} gives suite ${suite.id} conflicting facts.`);
      }
      if (repeated === undefined) {
        suites.push(suite);
      }
    }
    const existingTotalCount = existing.suiteTotalCount;
    const nextTotalCount = args.evidence.cloudflareSuiteTotalCount;
    if (
      existingTotalCount !== undefined &&
      nextTotalCount !== undefined &&
      existingTotalCount !== nextTotalCount
    ) {
      throw new Error(`Fixture commit ${nodeId} gives conflicting suite totals.`);
    }
    observations.set(nodeId, {
      nodeId,
      repositoryId: args.repositoryId,
      sha: args.sha,
      suites,
      suiteTotalCount: existingTotalCount ?? nextTotalCount,
    });
  };
  for (const branch of args.branches) {
    append({
      nodeId: branch.commitNodeId ?? fixtureCommitNodeId(args.repositoryId, branch.sha),
      repositoryId: args.repositoryId,
      sha: branch.sha,
      evidence: branch,
    });
  }
  for (const pullRequest of args.pullRequests) {
    append({
      nodeId:
        pullRequest.commitNodeId ?? fixtureCommitNodeId(args.repositoryId, pullRequest.headRefOid),
      repositoryId: args.repositoryId,
      sha: pullRequest.headRefOid,
      evidence: pullRequest,
    });
  }
  return observations;
}

function makeCloudflareCommitObservationNode(commit: FixtureCommitObservation) {
  return {
    __typename: "Commit",
    id: commit.nodeId,
    oid: commit.sha,
    repository: { id: commit.repositoryId },
    checkSuites: makeCloudflareSuitePage({
      commitNodeId: commit.nodeId,
      suites: commit.suites,
      totalCount: commit.suiteTotalCount,
      start: 0,
      width: 3,
    }),
  };
}

function createRepositoryRequest(fixture: RepositoryFixture): {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
  observations: RequestObservations;
} {
  const observations: RequestObservations = {
    branchPageSizes: [],
    cloudflareCommitBatchIds: [],
    pullRequestComparisonBatchSizes: [],
    branchVerificationPasses: 0,
    pullRequestVerificationPasses: 0,
    requestedRepositoryIds: [],
    cloudflareSuiteContinuationRequests: 0,
    cloudflareCheckRunContinuationRequests: 0,
  };
  const branchNodes = fixture.branches.map((branch) => makeBranchNode(fixture, branch));
  const verificationBranches = fixture.verificationBranches ?? fixture.branches;
  const branchSignatureNodes = verificationBranches.map((branch) =>
    makeBranchSignatureNode(fixture.repositoryId, branch),
  );
  const pullRequestNodes = fixture.pullRequests.map((pullRequest) =>
    makePullRequestNode(fixture, pullRequest),
  );
  const pullRequestSignatureNodes = (fixture.verificationPullRequests ?? fixture.pullRequests).map(
    (pullRequest) =>
      makePullRequestSignatureNode(fixture.repositoryId, fixture.defaultBranch, pullRequest),
  );
  const initialCommitObservations = buildFixtureCommitObservations({
    repositoryId: fixture.repositoryId,
    branches: fixture.branches,
    pullRequests: fixture.pullRequests,
  });
  const verificationCommitObservations = buildFixtureCommitObservations({
    repositoryId: fixture.repositoryId,
    branches: verificationBranches,
    pullRequests: fixture.verificationPullRequests ?? fixture.pullRequests,
  });
  const activeCommits = new Map<string, FixtureCommitObservation>();
  const activeSuites = new Map<string, FixtureCloudflareCheckSuite>();
  const activateCommit = (commit: FixtureCommitObservation): void => {
    activeCommits.set(commit.nodeId, commit);
    for (const suite of commit.suites) {
      activeSuites.set(suite.id, suite);
    }
  };

  const requestGraphql: RepositoryInventoryGraphqlRequest = async (query, variables) => {
    if (query.includes("query RepositoryInventoryBranchSignaturePage(")) {
      if (!query.includes("orderBy: { field: ALPHABETICAL, direction: ASC }")) {
        throw new Error("Expected stable alphabetical branch verification.");
      }
      for (const field of [
        "target { ... on Commit { oid } }",
        "statusCheckRollup",
        "contexts(first: 1)",
        "checkRunCount",
        "statusContextCount",
        "checkRunCountsByState",
        "statusContextCountsByState",
        "repository { id }",
      ]) {
        if (!query.includes(field)) {
          throw new Error(`Expected branch verification ${field}.`);
        }
      }
      if (query.includes("... on StatusContext") || query.includes("contexts(first: 100)")) {
        throw new Error("Branch inventory must not download ordinary check contexts.");
      }
      if (query.includes("checkSuites") || query.includes("checkRuns")) {
        throw new Error("Branch verification must not download Cloudflare observations.");
      }
      const start = readCursor(variables, "branch-signature");
      if (start === 0) {
        observations.branchVerificationPasses += 1;
      }
      const width = fixture.branchVerificationPageWidth ?? branchSignatureNodes.length;
      const page = slicePage({
        values: branchSignatureNodes,
        start,
        width,
        cursorPrefix: "branch-signature",
      });
      return {
        repository: {
          id: fixture.repositoryId,
          databaseId: Number(fixture.repositoryDatabaseId),
          nameWithOwner: fixture.repositoryFullName,
          defaultBranchRef:
            fixture.defaultBranch === null
              ? null
              : {
                  name: fixture.defaultBranch,
                  target: {
                    oid: verificationBranches.find(
                      (branch) => branch.name === fixture.defaultBranch,
                    )?.sha,
                  },
                },
          refs: {
            totalCount: branchSignatureNodes.length,
            ...page,
          },
        },
      };
    }

    if (query.includes("query RepositoryInventoryBranchPage(")) {
      if (!query.includes("orderBy: { field: ALPHABETICAL, direction: ASC }")) {
        throw new Error("Expected stable alphabetical branch pagination.");
      }
      for (const field of [
        "contexts(first: 1)",
        "checkRunCountsByState",
        "statusContextCountsByState",
        "repository { id }",
      ]) {
        if (!query.includes(field)) {
          throw new Error(`Expected branch collection ${field}.`);
        }
      }
      if (query.includes("... on StatusContext") || query.includes("contexts(first: 100)")) {
        throw new Error("Branch inventory must not download ordinary check contexts.");
      }
      if (query.includes("checkSuites") || query.includes("checkRuns")) {
        throw new Error("Branch collection must not download Cloudflare observations.");
      }
      const start = readCursor(variables, "branch");
      const pageSize = requireNumberVariable(variables, "pageSize");
      if (start === 0) {
        observations.branchPageSizes.push(pageSize);
        observations.requestedRepositoryIds.push(requireStringVariable(variables, "repositoryId"));
      }
      const width = fixture.branchPageWidth ?? branchNodes.length;
      const page = slicePage({
        values: branchNodes,
        start,
        width,
        cursorPrefix: "branch",
      });
      return {
        repository: {
          id: fixture.repositoryId,
          databaseId: Number(fixture.repositoryDatabaseId),
          nameWithOwner: fixture.repositoryFullName,
          defaultBranchRef:
            fixture.defaultBranch === null
              ? null
              : {
                  name: fixture.defaultBranch,
                  target: {
                    oid: fixture.branches.find((branch) => branch.name === fixture.defaultBranch)
                      ?.sha,
                  },
                },
          refs: {
            totalCount: branchNodes.length,
            ...page,
          },
        },
      };
    }

    if (query.includes("query RepositoryInventoryPullRequestSignaturePage(")) {
      if (!query.includes("orderBy: { field: CREATED_AT, direction: ASC }")) {
        throw new Error("Expected stable pull request verification ordering.");
      }
      for (const field of [
        "updatedAt",
        "baseRefName",
        "headRefName",
        "headRefOid",
        "headRepository { id nameWithOwner owner { login } }",
        "commits(last: 1)",
        "statusCheckRollup",
        "contexts(first: 1)",
        "checkRunCount",
        "statusContextCount",
        "checkRunCountsByState",
        "statusContextCountsByState",
        "repository { id }",
      ]) {
        if (!query.includes(field)) {
          throw new Error(`Expected pull request verification ${field}.`);
        }
      }
      if (query.includes("... on StatusContext") || query.includes("contexts(first: 100)")) {
        throw new Error("Pull request inventory must not download ordinary check contexts.");
      }
      if (query.includes("checkSuites") || query.includes("checkRuns")) {
        throw new Error("Pull request verification must not download Cloudflare observations.");
      }
      const start = readCursor(variables, "pull-request-signature");
      if (start === 0) {
        observations.pullRequestVerificationPasses += 1;
      }
      const width = fixture.pullRequestVerificationPageWidth ?? pullRequestSignatureNodes.length;
      const page = slicePage({
        values: pullRequestSignatureNodes,
        start,
        width,
        cursorPrefix: "pull-request-signature",
      });
      return {
        repository: {
          id: fixture.repositoryId,
          databaseId: Number(fixture.repositoryDatabaseId),
          nameWithOwner: fixture.repositoryFullName,
          pullRequests: {
            totalCount: pullRequestSignatureNodes.length,
            ...page,
          },
        },
      };
    }

    if (query.includes("query RepositoryInventoryPullRequestPage(")) {
      if (!query.includes("orderBy: { field: CREATED_AT, direction: ASC }")) {
        throw new Error("Expected stable pull request creation ordering.");
      }
      for (const field of ["additions", "deletions", "changedFiles"]) {
        if (!query.includes(field)) {
          throw new Error(`Expected pull request ${field}.`);
        }
      }
      for (const field of [
        "contexts(first: 1)",
        "checkRunCountsByState",
        "statusContextCountsByState",
        "repository { id }",
      ]) {
        if (!query.includes(field)) {
          throw new Error(`Expected pull request collection ${field}.`);
        }
      }
      if (query.includes("... on StatusContext") || query.includes("contexts(first: 100)")) {
        throw new Error("Pull request inventory must not download ordinary check contexts.");
      }
      if (query.includes("checkSuites") || query.includes("checkRuns")) {
        throw new Error("Pull request collection must not download Cloudflare observations.");
      }
      const start = readCursor(variables, "pull-request");
      const width = fixture.pullRequestPageWidth ?? pullRequestNodes.length;
      const page = slicePage({
        values: pullRequestNodes,
        start,
        width,
        cursorPrefix: "pull-request",
      });
      return {
        repository: {
          id: fixture.repositoryId,
          databaseId: Number(fixture.repositoryDatabaseId),
          nameWithOwner: fixture.repositoryFullName,
          pullRequests: {
            totalCount: pullRequestNodes.length,
            ...page,
          },
        },
      };
    }

    if (query.includes("query RepositoryInventoryPullRequestComparisonBatch(")) {
      const comparisonNodes: Record<string, unknown> = {};
      let index = 0;
      while (`pr${index}Number` in variables) {
        const number = requireNumberVariable(variables, `pr${index}Number`);
        const pullRequest = fixture.pullRequests.find((candidate) => candidate.number === number);
        if (pullRequest === undefined) {
          throw new Error(`Unknown pull request number ${number}.`);
        }
        const baseRefName = pullRequest.baseRefName ?? fixture.defaultBranch;
        const baseBranch = fixture.branches.find((branch) => branch.name === baseRefName);
        if (baseBranch === undefined) {
          throw new Error(`Unknown pull request base ${baseRefName}.`);
        }
        const headRepositoryAvailable = pullRequest.headRepositoryAvailable !== false;
        if (headRepositoryAvailable) {
          expect(requireStringVariable(variables, `pr${index}HeadRef`)).toBe(
            `${pullRequest.headRepositoryFullName.split("/")[0]}:${pullRequest.headRefName}`,
          );
        } else {
          expect(`pr${index}HeadRef` in variables).toBe(false);
        }
        comparisonNodes[`pr${index}`] = {
          id: pullRequest.id,
          number: pullRequest.number,
          baseRefName,
          headRefName: pullRequest.headRefName,
          headRefOid: pullRequest.headRefOid,
          headRepository: headRepositoryAvailable
            ? {
                id: pullRequest.headRepositoryId,
                nameWithOwner: pullRequest.headRepositoryFullName,
                owner: { login: pullRequest.headRepositoryFullName.split("/")[0] },
              }
            : null,
          headRef:
            !headRepositoryAvailable || pullRequest.headRefAvailable === false
              ? null
              : {
                  name: pullRequest.headRefName,
                  target: { oid: pullRequest.headRefOid },
                },
          baseRef:
            pullRequest.baseRefAvailable === false
              ? null
              : {
                  name: baseRefName,
                  target: { oid: baseBranch.sha },
                  ...(headRepositoryAvailable
                    ? {
                        comparison: pullRequest.comparisonUnavailable
                          ? null
                          : {
                              aheadBy: pullRequest.aheadBy ?? 0,
                              behindBy: pullRequest.behindBy ?? 0,
                              baseTarget: { oid: baseBranch.sha },
                              headTarget: {
                                oid: pullRequest.comparisonHeadTargetOid ?? pullRequest.headRefOid,
                              },
                            },
                      }
                    : {}),
                },
        };
        index += 1;
      }
      observations.pullRequestComparisonBatchSizes.push(index);
      return {
        repository: {
          id: fixture.repositoryId,
          databaseId: Number(fixture.repositoryDatabaseId),
          nameWithOwner: fixture.repositoryFullName,
          ...comparisonNodes,
        },
      };
    }

    if (query.includes("query RepositoryInventoryCloudflareCommitBatch(")) {
      for (const field of [
        "nodes(ids: $commitIds)",
        "first: 3",
        "filterBy: { appId: 85455 }",
        "filterBy: { checkType: LATEST }",
        "repository { id }",
      ]) {
        if (!query.includes(field)) {
          throw new Error(`Expected Cloudflare commit batch ${field}.`);
        }
      }
      if (query.includes("statusCheckRollup")) {
        throw new Error("Cloudflare commit batches must not repeat aggregate check metadata.");
      }
      const commitIds = requireStringArrayVariable(variables, "commitIds");
      observations.cloudflareCommitBatchIds.push(commitIds);
      const pass = observations.branchVerificationPasses > 0 ? "verification" : "initial";
      const source =
        pass === "verification" ? verificationCommitObservations : initialCommitObservations;
      const nodes = commitIds.map((nodeId) => {
        const commit = source.get(nodeId);
        if (commit === undefined) {
          throw new Error(`Unknown commit node ${nodeId}.`);
        }
        activateCommit(commit);
        return makeCloudflareCommitObservationNode(commit);
      });
      return {
        nodes: fixture.transformCloudflareBatch?.({ commitIds, nodes, pass }) ?? nodes,
      };
    }

    if (query.includes("query RepositoryInventoryLabelContinuation(")) {
      const nodeId = requireStringVariable(variables, "nodeId");
      const pullRequest = fixture.pullRequests.find((candidate) => candidate.id === nodeId);
      if (!pullRequest) {
        throw new Error(`Unknown pull request node ${nodeId}.`);
      }
      return {
        node: {
          __typename: "PullRequest",
          labels: makeLabelPage(pullRequest, readCursor(variables, `label-${nodeId}`)),
        },
      };
    }

    if (query.includes("query RepositoryInventoryCloudflareSuiteContinuation(")) {
      if (!query.includes("first: 100") || !query.includes("after: $after")) {
        throw new Error("Expected complete Cloudflare suite continuation pagination.");
      }
      const nodeId = requireStringVariable(variables, "nodeId");
      const commit = activeCommits.get(nodeId);
      if (commit === undefined) {
        throw new Error(`Unknown commit node ${nodeId}.`);
      }
      observations.cloudflareSuiteContinuationRequests += 1;
      return {
        node: {
          __typename: "Commit",
          id: commit.nodeId,
          oid: commit.sha,
          repository: { id: commit.repositoryId },
          checkSuites: makeCloudflareSuitePage({
            commitNodeId: nodeId,
            suites: commit.suites,
            totalCount: commit.suiteTotalCount,
            start: readCursor(variables, `cloudflare-suites-${nodeId}`),
            width: 100,
          }),
        },
      };
    }

    if (query.includes("query RepositoryInventoryCloudflareCheckRunContinuation(")) {
      if (!query.includes("first: 100") || !query.includes("after: $after")) {
        throw new Error("Expected complete Cloudflare check run continuation pagination.");
      }
      const nodeId = requireStringVariable(variables, "nodeId");
      const suite = activeSuites.get(nodeId);
      if (suite === undefined) {
        throw new Error(`Unknown Cloudflare check suite ${nodeId}.`);
      }
      observations.cloudflareCheckRunContinuationRequests += 1;
      return {
        node: {
          __typename: "CheckSuite",
          id: suite.id,
          branch: suite.branchName === null ? null : { name: suite.branchName },
          checkRuns: makeCloudflareCheckRunPage(
            suite,
            readCursor(variables, `cloudflare-runs-${nodeId}`),
          ),
        },
      };
    }

    throw new Error("Unexpected GraphQL query.");
  };

  const requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest = async (
    query,
    variables,
  ) => {
    const data = await requestGraphql(query, variables);
    const errors: Array<{
      message: string;
      type?: string;
      path?: Array<string | number>;
    }> = [];
    if (query.includes("query RepositoryInventoryBranchPage(")) {
      const start = readCursor(variables, "branch");
      const width = fixture.branchPageWidth ?? fixture.branches.length;
      for (const [index, branch] of fixture.branches.slice(start, start + width).entries()) {
        if (branch.comparisonUnavailable) {
          errors.push({
            message: `Branch ${branch.name} is not comparable.`,
            type: "NOT_FOUND",
            path: ["repository", "refs", "nodes", index, "comparison"],
          });
        }
      }
    }
    if (query.includes("query RepositoryInventoryPullRequestComparisonBatch(")) {
      let index = 0;
      while (`pr${index}Number` in variables) {
        const number = requireNumberVariable(variables, `pr${index}Number`);
        const pullRequest = fixture.pullRequests.find((candidate) => candidate.number === number);
        if (pullRequest?.comparisonError) {
          errors.push({
            ...pullRequest.comparisonError,
            path: pullRequest.comparisonError.path ?? [
              "repository",
              `pr${index}`,
              "baseRef",
              "comparison",
            ],
          });
        }
        index += 1;
      }
    }
    return { data, errors };
  };

  return { requestGraphql, requestGraphqlPartial, observations };
}

function makeBaseFixture(): RepositoryFixture {
  return {
    repositoryId: "R_base",
    repositoryDatabaseId: "42",
    repositoryFullName: "samebase/samebase",
    defaultBranch: "main",
    branches: [
      {
        id: "REF_main",
        name: "main",
        sha: "main-sha",
        checkCount: 0,
      },
    ],
    pullRequests: [],
  };
}

describe("GitHub repository inventory collection", () => {
  it("uses exact aggregate check counts without ordinary check pagination", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branchPageWidth: 1,
      pullRequestPageWidth: 1,
      branches: [
        {
          id: "REF_main",
          name: "main",
          sha: "main-sha",
          checkCount: 101,
          statusContextCount: 1,
          rollupState: "FAILURE",
          checkRunCountsByState: [
            { state: "SUCCESS", count: 95 },
            { state: "FAILURE", count: 1 },
            { state: "IN_PROGRESS", count: 1 },
            { state: "NEUTRAL", count: 1 },
            { state: "COMPLETED", count: 1 },
            { state: "SKIPPED", count: 1 },
          ],
          statusContextCountsByState: [{ state: "EXPECTED", count: 1 }],
        },
        {
          id: "REF_feature",
          name: "feature",
          sha: "feature-sha",
          checkCount: 0,
          aheadBy: 4,
          behindBy: 2,
        },
        {
          id: "REF_release",
          name: "release",
          sha: "release-sha",
          checkCount: 0,
        },
      ],
      pullRequests: [
        {
          id: "PR_one",
          number: 1,
          title: "Same-repository change",
          headRefName: "feature",
          headRefOid: "feature-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 1_240,
          deletions: 318,
          changedFiles: 17,
          labelCount: 101,
          checkCount: 0,
          updatedAt: "2026-07-15T10:02:00Z",
          aheadBy: 6,
          behindBy: 2,
        },
        {
          id: "PR_two",
          number: 2,
          title: "Fork change",
          headRefName: "contribution",
          headRefOid: "fork-sha",
          headRepositoryId: "R_fork",
          headRepositoryFullName: "contributor/samebase",
          isDraft: true,
          isCrossRepository: true,
          additions: 7,
          deletions: 2,
          changedFiles: 3,
          baseRefName: "release",
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:03:00Z",
          aheadBy: 1,
          behindBy: 3,
        },
      ],
    };
    const { observations, requestGraphql, requestGraphqlPartial } =
      createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql,
      requestGraphqlPartial,
    });

    expect(result.branchCount).toBe(3);
    expect(result.pullRequestCount).toBe(2);
    expect(result.items).toHaveLength(5);

    const main = result.items.find((item) => item.kind === "branch" && item.name === "main");
    if (!main || main.kind !== "branch") {
      throw new Error("Expected the main branch.");
    }
    expect(main.isDefault).toBe(true);
    expect(main.comparison).toEqual({ state: "ready", aheadBy: 0, behindBy: 0 });
    expect(main.headCommit.checks).toMatchObject({
      state: "failure",
      totalCount: 101,
      checkRunCount: 100,
      statusContextCount: 1,
      successCount: 95,
      failureCount: 1,
      runningCount: 2,
      neutralCount: 2,
      unknownCount: 1,
    });
    const feature = result.items.find((item) => item.kind === "branch" && item.name === "feature");
    expect(feature?.comparison).toEqual({ state: "ready", aheadBy: 4, behindBy: 2 });

    const sameRepositoryPullRequest = result.items.find(
      (item) => item.kind === "pull_request" && item.rowKey === "pull-request:PR_one",
    );
    const forkPullRequest = result.items.find(
      (item) => item.kind === "pull_request" && item.rowKey === "pull-request:PR_two",
    );
    if (
      !sameRepositoryPullRequest ||
      sameRepositoryPullRequest.kind !== "pull_request" ||
      !forkPullRequest ||
      forkPullRequest.kind !== "pull_request"
    ) {
      throw new Error("Expected both pull requests.");
    }
    expect(sameRepositoryPullRequest.canOpenInSamebase).toBe(true);
    expect(sameRepositoryPullRequest).toMatchObject({
      additions: 1_240,
      deletions: 318,
      changedFiles: 17,
      comparison: { state: "ready", aheadBy: 6, behindBy: 2 },
      isCrossRepository: false,
    });
    expect(sameRepositoryPullRequest.labels).toHaveLength(101);
    expect(sameRepositoryPullRequest.labels.slice(0, 4).map((label) => label.name)).toEqual([
      "label-0",
      "label-1",
      "label-10",
      "label-100",
    ]);
    expect(sameRepositoryPullRequest.labels).toContainEqual({
      name: "label-100",
      color: "ff0000",
    });
    expect(forkPullRequest.canOpenInSamebase).toBe(false);
    expect(forkPullRequest.isDraft).toBe(true);
    expect(forkPullRequest).toMatchObject({
      baseRefName: "release",
      comparison: { state: "ready", aheadBy: 1, behindBy: 3 },
      isCrossRepository: true,
    });
    expect(forkPullRequest.labels).toEqual([]);
    expect(observations.branchVerificationPasses).toBe(1);
    expect(observations.pullRequestVerificationPasses).toBe(1);
    expect(observations.pullRequestComparisonBatchSizes).toEqual([1, 1]);
    expect(observations.cloudflareCommitBatchIds.map((batch) => batch.length)).toEqual([4, 4]);
    expect(observations.cloudflareCommitBatchIds[0]).toEqual(
      observations.cloudflareCommitBatchIds[1],
    );
    expect(observations.cloudflareCommitBatchIds[0]).toContain(
      fixtureCommitNodeId("R_base", "feature-sha"),
    );
    expect(observations.cloudflareSuiteContinuationRequests).toBe(0);
    expect(observations.cloudflareCheckRunContinuationRequests).toBe(0);
  });

  it("keeps every Worker build and both preview URL types", async () => {
    const alpha = makeWorkerBuild({
      id: "run-alpha",
      workerName: "alpha",
      versionUrl: "https://version-alpha.workers.dev/",
      branchAliasUrl: "https://main-alpha.workers.dev/",
    });
    const beta = makeWorkerBuild({
      id: "run-beta",
      workerName: "beta",
      versionUrl: "https://version-beta.workers.dev/",
      branchAliasUrl: "https://main-beta.workers.dev/",
    });
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          ...makeBaseFixture().branches[0],
          checkCount: 2,
          cloudflareSuites: [
            {
              id: "suite-main",
              branchName: "main",
              checkRuns: [alpha, beta],
            },
          ],
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: fixture.repositoryId,
      expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const main = result.items.find((item) => item.kind === "branch" && item.name === "main");
    if (main?.kind !== "branch") {
      throw new Error("Expected the main branch.");
    }
    expect(main.cloudflareBuilds).toMatchObject([
      {
        sourceKey: "run-alpha",
        workerName: "alpha",
        branch: { state: "known", name: "main" },
        state: "success",
        preview: {
          state: "ready",
          versionUrl: "https://version-alpha.workers.dev/",
          branchAlias: {
            state: "ready",
            branchName: "main",
            url: "https://main-alpha.workers.dev/",
          },
        },
      },
      {
        sourceKey: "run-beta",
        workerName: "beta",
        branch: { state: "known", name: "main" },
        state: "success",
        preview: {
          state: "ready",
          versionUrl: "https://version-beta.workers.dev/",
          branchAlias: {
            state: "ready",
            branchName: "main",
            url: "https://main-beta.workers.dev/",
          },
        },
      },
    ]);
  });

  it("isolates branch aliases when two branches point at the same SHA", async () => {
    const suites: FixtureCloudflareCheckSuite[] = [
      {
        id: "suite-main",
        branchName: "main",
        checkRuns: [
          makeWorkerBuild({
            id: "run-main",
            workerName: "web",
            branchAliasUrl: "https://main-web.workers.dev/",
          }),
        ],
      },
      {
        id: "suite-release",
        branchName: "release",
        checkRuns: [
          makeWorkerBuild({
            id: "run-release",
            workerName: "web",
            branchAliasUrl: "https://release-web.workers.dev/",
          }),
        ],
      },
    ];
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          id: "REF_main",
          name: "main",
          sha: "shared-sha",
          checkCount: 2,
          cloudflareSuites: suites,
        },
        {
          id: "REF_release",
          name: "release",
          sha: "shared-sha",
          checkCount: 2,
          cloudflareSuites: suites,
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: fixture.repositoryId,
      expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const branches = result.items.filter((item) => item.kind === "branch");
    const main = branches.find((branch) => branch.name === "main");
    const release = branches.find((branch) => branch.name === "release");
    expect(main?.cloudflareBuilds.map((build) => build.sourceKey)).toEqual(["run-main"]);
    expect(release?.cloudflareBuilds.map((build) => build.sourceKey)).toEqual(["run-release"]);
    expect(request.observations.cloudflareCommitBatchIds).toEqual([
      [fixtureCommitNodeId("R_base", "shared-sha")],
      [fixtureCommitNodeId("R_base", "shared-sha")],
    ]);
  });

  it("keeps fork identity separate from its base-scoped commit observation", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          id: "REF_main",
          name: "main",
          sha: "shared-sha",
          checkCount: 1,
          cloudflareSuites: [
            {
              id: "suite-base",
              branchName: "main",
              checkRuns: [makeWorkerBuild({ id: "run-base", workerName: "base" })],
            },
          ],
        },
      ],
      pullRequests: [
        {
          id: "PR_fork",
          number: 1,
          title: "Fork commit with the same Git object",
          headRefName: "contribution",
          headRefOid: "shared-sha",
          headRepositoryId: "R_fork",
          headRepositoryFullName: "contributor/samebase",
          isDraft: false,
          isCrossRepository: true,
          additions: 1,
          deletions: 0,
          changedFiles: 1,
          labelCount: 0,
          checkCount: 1,
          updatedAt: "2026-07-15T10:02:00Z",
          cloudflareSuites: [
            {
              id: "suite-fork",
              branchName: "contribution",
              checkRuns: [makeWorkerBuild({ id: "run-fork", workerName: "fork" })],
            },
          ],
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: fixture.repositoryId,
      expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const branch = result.items.find((item) => item.kind === "branch");
    const pullRequest = result.items.find((item) => item.kind === "pull_request");
    expect(branch?.cloudflareBuilds.map((build) => build.sourceKey)).toEqual(["run-base"]);
    expect(pullRequest?.cloudflareBuilds.map((build) => build.sourceKey)).toEqual(["run-fork"]);
    expect(pullRequest).toMatchObject({
      headRepository: { repositoryNodeId: "R_fork" },
      isCrossRepository: true,
    });
    expect(request.observations.cloudflareCommitBatchIds).toEqual([
      [fixtureCommitNodeId("R_base", "shared-sha")],
      [fixtureCommitNodeId("R_base", "shared-sha")],
    ]);
  });

  it.each([
    { pageSize: 50, expectedBatchSizes: [50, 1, 50, 1] },
    { pageSize: 25, expectedBatchSizes: [25, 25, 1, 25, 25, 1] },
  ])(
    "batches 51 unique commits at $pageSize commits without weakening either provider pass",
    async ({ pageSize, expectedBatchSizes }) => {
      const branches: FixtureBranch[] = Array.from({ length: 51 }, (_, index) => ({
        id: `REF_${index}`,
        name: `branch-${String(index).padStart(3, "0")}`,
        sha: `sha-${String(index).padStart(3, "0")}`,
        checkCount: 0,
      }));
      const fixture: RepositoryFixture = {
        ...makeBaseFixture(),
        defaultBranch: "branch-000",
        branches,
        branchPageWidth: pageSize,
      };
      const request = createRepositoryRequest(fixture);

      await collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      });

      expect(request.observations.cloudflareCommitBatchIds.map((batch) => batch.length)).toEqual(
        expectedBatchSizes,
      );
    },
  );

  it.each<{ name: string; expected: string; transform: TransformCloudflareBatch }>([
    {
      name: "null node",
      expected: "non-commit Cloudflare observation",
      transform: () => [null, null],
    },
    {
      name: "missing node",
      expected: "omitted a repository commit",
      transform: ({ nodes }) => nodes.slice(0, 1),
    },
    {
      name: "duplicate node",
      expected: "unexpected or duplicate",
      transform: ({ nodes }) => [nodes[0], nodes[0]],
    },
    {
      name: "wrong SHA",
      expected: "did not match its repository commit",
      transform: ({ commitIds, nodes }) => [
        makeCloudflareCommitObservationNode({
          nodeId: commitIds[0] ?? "missing",
          repositoryId: "R_base",
          sha: "wrong-sha",
          suites: [],
        }),
        nodes[1],
      ],
    },
    {
      name: "wrong repository",
      expected: "did not match its repository commit",
      transform: ({ commitIds, nodes }) => [
        makeCloudflareCommitObservationNode({
          nodeId: commitIds[0] ?? "missing",
          repositoryId: "R_other",
          sha: "feature-sha",
          suites: [],
        }),
        nodes[1],
      ],
    },
    {
      name: "non-Commit node",
      expected: "non-commit Cloudflare observation",
      transform: ({ commitIds, nodes }) => [
        { __typename: "Repository", id: commitIds[0] },
        nodes[1],
      ],
    },
  ])("rejects a Cloudflare batch with a $name", async ({ expected, transform }) => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        ...makeBaseFixture().branches,
        {
          id: "REF_feature",
          name: "feature",
          sha: "feature-sha",
          checkCount: 0,
        },
      ],
      transformCloudflareBatch: transform,
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow(expected);
  });

  it("accepts reordered commit batch nodes while preserving exact identities", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        ...makeBaseFixture().branches,
        {
          id: "REF_feature",
          name: "feature",
          sha: "feature-sha",
          checkCount: 0,
        },
      ],
      transformCloudflareBatch: ({ nodes }) => [...nodes].reverse(),
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: fixture.repositoryId,
      expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    expect(result.branchCount).toBe(2);
    expect(request.observations.cloudflareCommitBatchIds.map((batch) => batch.length)).toEqual([
      2, 2,
    ]);
  });

  it("rejects two node IDs for one repository-scoped commit", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          id: "REF_main",
          commitNodeId: "COMMIT_first",
          name: "main",
          sha: "shared-sha",
          checkCount: 0,
        },
        {
          id: "REF_release",
          commitNodeId: "COMMIT_second",
          name: "release",
          sha: "shared-sha",
          checkCount: 0,
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("two commit identities for one repository commit");
  });

  it("rejects one node ID for two repository-scoped commits", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          id: "REF_main",
          commitNodeId: "COMMIT_shared",
          name: "main",
          sha: "main-sha",
          checkCount: 0,
        },
        {
          id: "REF_feature",
          commitNodeId: "COMMIT_shared",
          name: "feature",
          sha: "feature-sha",
          checkCount: 0,
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("one commit identity for different repository commits");
  });

  it("keeps a null provider branch explicit without promoting its alias", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          ...makeBaseFixture().branches[0],
          checkCount: 1,
          cloudflareSuites: [
            {
              id: "suite-unknown",
              branchName: null,
              checkRuns: [
                makeWorkerBuild({
                  id: "run-unknown",
                  workerName: "web",
                  branchAliasUrl: "https://unattributed-web.workers.dev/",
                }),
              ],
            },
          ],
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: fixture.repositoryId,
      expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const main = result.items.find((item) => item.kind === "branch");
    if (main?.kind !== "branch") {
      throw new Error("Expected the main branch.");
    }
    expect(main.cloudflareBuilds).toMatchObject([
      {
        sourceKey: "run-unknown",
        branch: { state: "unknown" },
        preview: {
          state: "ready",
          branchAlias: {
            state: "provider_unknown",
            reason: "branch_unavailable",
            providerUrl: "https://unattributed-web.workers.dev/",
          },
        },
      },
    ]);
  });

  it("paginates more than ten Cloudflare suites without truncation", async () => {
    const suites: FixtureCloudflareCheckSuite[] = Array.from({ length: 11 }, (_, index) => ({
      id: `suite-${index}`,
      branchName: "main",
      checkRuns: [makeWorkerBuild({ id: `run-${index}`, workerName: `worker-${index}` })],
    }));
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          ...makeBaseFixture().branches[0],
          checkCount: 11,
          cloudflareSuites: suites,
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: fixture.repositoryId,
      expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const main = result.items.find((item) => item.kind === "branch");
    expect(main?.cloudflareBuilds).toHaveLength(11);
    expect(request.observations.cloudflareSuiteContinuationRequests).toBe(2);
    expect(request.observations.cloudflareCheckRunContinuationRequests).toBe(0);
  });

  it("paginates more than one hundred latest Cloudflare runs without truncation", async () => {
    const checkRuns = Array.from({ length: 101 }, (_, index) =>
      makeWorkerBuild({ id: `run-${index}`, workerName: `worker-${index}` }),
    );
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          ...makeBaseFixture().branches[0],
          checkCount: 101,
          cloudflareSuites: [
            {
              id: "suite-main",
              branchName: "main",
              checkRuns,
            },
          ],
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: fixture.repositoryId,
      expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const main = result.items.find((item) => item.kind === "branch");
    expect(main?.cloudflareBuilds).toHaveLength(101);
    expect(request.observations.cloudflareSuiteContinuationRequests).toBe(0);
    expect(request.observations.cloudflareCheckRunContinuationRequests).toBe(2);
  });

  it.each([
    {
      name: "a duplicate suite across pages",
      evidence: {
        checkCount: 11,
        cloudflareSuites: [
          ...Array.from({ length: 10 }, (_, index) => ({
            id: `suite-${index}`,
            branchName: "main",
            checkRuns: [makeWorkerBuild({ id: `run-${index}`, workerName: `worker-${index}` })],
          })),
          {
            id: "suite-0",
            branchName: "main",
            checkRuns: [makeWorkerBuild({ id: "run-repeat", workerName: "worker-repeat" })],
          },
        ],
      } satisfies FixtureCheckEvidence,
      error: "duplicate Cloudflare check suite",
    },
    {
      name: "a duplicate run across pages",
      evidence: {
        checkCount: 101,
        cloudflareSuites: [
          {
            id: "suite-main",
            branchName: "main",
            checkRuns: [
              ...Array.from({ length: 100 }, (_, index) =>
                makeWorkerBuild({ id: `run-${index}`, workerName: `worker-${index}` }),
              ),
              makeWorkerBuild({ id: "run-0", workerName: "worker-repeat" }),
            ],
          },
        ],
      } satisfies FixtureCheckEvidence,
      error: "duplicate Cloudflare check run",
    },
    {
      name: "an inconsistent suite total",
      evidence: {
        checkCount: 1,
        cloudflareSuiteTotalCount: 2,
        cloudflareSuites: [
          {
            id: "suite-main",
            branchName: "main",
            checkRuns: [makeWorkerBuild({ id: "run-main", workerName: "web" })],
          },
        ],
      } satisfies FixtureCheckEvidence,
      error: "did not return every suite",
    },
    {
      name: "an inconsistent run total",
      evidence: {
        checkCount: 1,
        cloudflareSuites: [
          {
            id: "suite-main",
            branchName: "main",
            totalCount: 2,
            checkRuns: [makeWorkerBuild({ id: "run-main", workerName: "web" })],
          },
        ],
      } satisfies FixtureCheckEvidence,
      error: "did not return every check run",
    },
  ])("rejects $name", async ({ evidence, error }) => {
    const base = makeBaseFixture();
    const main = base.branches.at(0);
    if (main === undefined) {
      throw new Error("Expected the base fixture default branch.");
    }
    const fixture: RepositoryFixture = {
      ...base,
      branches: [{ ...main, ...evidence }],
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow(error);
  });

  it.each([
    {
      name: "duplicate aggregate states",
      checkRunCountsByState: [
        { state: "SUCCESS", count: 1 },
        { state: "SUCCESS", count: 0 },
      ] satisfies FixtureCheckEvidence["checkRunCountsByState"],
    },
    {
      name: "an incomplete aggregate total",
      checkRunCountsByState: [
        { state: "SUCCESS", count: 0 },
      ] satisfies FixtureCheckEvidence["checkRunCountsByState"],
    },
  ])("rejects $name", async ({ checkRunCountsByState }) => {
    const base = makeBaseFixture();
    const main = base.branches.at(0);
    if (main === undefined) {
      throw new Error("Expected the base fixture default branch.");
    }
    const fixture: RepositoryFixture = {
      ...base,
      branches: [{ ...main, checkCount: 1, checkRunCountsByState }],
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("inconsistent aggregate check counts");
  });

  it("keeps unavailable comparisons explicit without discarding ready siblings", async () => {
    const basePullRequest: FixturePullRequest = {
      id: "PR_ready",
      number: 1,
      title: "Ready comparison",
      headRefName: "main",
      headRefOid: "main-sha",
      headRepositoryId: "R_base",
      headRepositoryFullName: "samebase/samebase",
      isDraft: false,
      isCrossRepository: false,
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      labelCount: 0,
      checkCount: 0,
      updatedAt: "2026-07-15T10:02:00Z",
      aheadBy: 2,
      behindBy: 1,
    };
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        ...makeBaseFixture().branches,
        {
          id: "REF_orphan",
          name: "orphan",
          sha: "orphan-sha",
          checkCount: 0,
          comparisonUnavailable: true,
        },
      ],
      pullRequests: [
        basePullRequest,
        {
          ...basePullRequest,
          id: "PR_missing_head",
          number: 2,
          title: "Missing head",
          headRefAvailable: false,
          comparisonUnavailable: true,
          comparisonError: {
            message: "Could not resolve head ref.",
            type: "NOT_FOUND",
          },
        },
        {
          ...basePullRequest,
          id: "PR_missing_head_repository",
          number: 5,
          title: "Missing head repository",
          headRepositoryAvailable: false,
        },
        {
          ...basePullRequest,
          id: "PR_unrelated",
          number: 3,
          title: "Unrelated history",
          comparisonUnavailable: true,
          comparisonError: {
            message: "No common history.",
            type: "NOT_FOUND",
          },
        },
        {
          ...basePullRequest,
          id: "PR_missing_base",
          number: 4,
          title: "Missing base",
          baseRefAvailable: false,
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const comparisons = new Map(result.items.map((item) => [item.rowKey, item.comparison]));
    expect(comparisons.get("branch:orphan")).toEqual({
      state: "unavailable",
      reason: "not_comparable",
    });
    expect(comparisons.get("pull-request:PR_ready")).toEqual({
      state: "ready",
      aheadBy: 2,
      behindBy: 1,
    });
    expect(comparisons.get("pull-request:PR_missing_head")).toEqual({
      state: "unavailable",
      reason: "head_ref_unavailable",
    });
    expect(comparisons.get("pull-request:PR_missing_head_repository")).toEqual({
      state: "unavailable",
      reason: "head_ref_unavailable",
    });
    expect(comparisons.get("pull-request:PR_unrelated")).toEqual({
      state: "unavailable",
      reason: "not_comparable",
    });
    expect(comparisons.get("pull-request:PR_missing_base")).toEqual({
      state: "unavailable",
      reason: "base_ref_unavailable",
    });
  });

  it("caps pull request comparison batches at fifty aliases", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      pullRequestPageWidth: 50,
      pullRequests: Array.from({ length: 51 }, (_, index) => ({
        id: `PR_${index + 1}`,
        number: index + 1,
        title: `Pull request ${index + 1}`,
        headRefName: "main",
        headRefOid: "main-sha",
        headRepositoryId: "R_base",
        headRepositoryFullName: "samebase/samebase",
        isDraft: false,
        isCrossRepository: false,
        additions: index + 1,
        deletions: 0,
        changedFiles: 1,
        labelCount: 0,
        checkCount: 0,
        updatedAt: "2026-07-15T10:02:00Z",
      })),
    };
    const request = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    expect(result.pullRequestCount).toBe(51);
    expect(request.observations.pullRequestComparisonBatchSizes).toEqual([50, 1]);
  });

  it("rejects comparison targets that do not match the collected pull request head", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      pullRequests: [
        {
          id: "PR_changed",
          number: 1,
          title: "Changed during comparison",
          headRefName: "main",
          headRefOid: "main-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 1,
          deletions: 0,
          changedFiles: 1,
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:02:00Z",
          comparisonHeadTargetOid: "later-head-sha",
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("comparison targets changed");
  });

  it.each([
    {
      name: "a NOT_FOUND error at another field",
      error: {
        message: "Unexpected missing title.",
        type: "NOT_FOUND",
        path: ["repository", "pr0", "title"],
      },
    },
    {
      name: "a forbidden comparison",
      error: {
        message: "Resource not accessible by integration.",
        type: "FORBIDDEN",
      },
    },
    {
      name: "a root repository NOT_FOUND error",
      error: {
        message: "Repository not found.",
        type: "NOT_FOUND",
        path: ["repository"],
      },
    },
  ])("rejects $name instead of hiding it as unavailable", async ({ error }) => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      pullRequests: [
        {
          id: "PR_error",
          number: 1,
          title: "Unexpected comparison error",
          headRefName: "main",
          headRefOid: "main-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 1,
          deletions: 0,
          changedFiles: 1,
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:02:00Z",
          comparisonUnavailable: true,
          comparisonError: error,
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow(error.message);
  });

  it("collects labels beyond the former storage chunking limit without truncation", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      pullRequests: [
        {
          id: "PR_many_labels",
          number: 1,
          title: "Too many labels",
          headRefName: "main",
          headRefOid: "main-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 5_001,
          deletions: 0,
          changedFiles: 1,
          labelCount: 5_001,
          checkCount: 0,
          updatedAt: "2026-07-15T10:02:00Z",
        },
      ],
    };

    const request = createRepositoryRequest(fixture);
    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    const pullRequest = result.items.find((item) => item.kind === "pull_request");
    expect(pullRequest?.labels).toHaveLength(5_001);
  });

  it("keeps the fingerprint stable across identical complete collections", async () => {
    const main = makeBaseFixture().branches[0];
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [{ ...main, checkCount: 1 }],
      pullRequests: [
        {
          id: "PR_one",
          number: 1,
          title: "Fingerprint input",
          headRefName: "main",
          headRefOid: "main-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 4,
          deletions: 2,
          changedFiles: 2,
          labelCount: 1,
          checkCount: 1,
          updatedAt: "2026-07-15T10:02:00Z",
        },
      ],
    };
    const firstRequest = createRepositoryRequest(fixture);
    const first = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: firstRequest.requestGraphql,
      requestGraphqlPartial: firstRequest.requestGraphqlPartial,
    });
    const secondRequest = createRepositoryRequest(fixture);
    const second = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: secondRequest.requestGraphql,
      requestGraphqlPartial: secondRequest.requestGraphqlPartial,
    });

    expect(first.items).toEqual(second.items);
    const firstPullRequest = first.items.find((item) => item.kind === "pull_request");
    const secondPullRequest = second.items.find((item) => item.kind === "pull_request");
    expect(firstPullRequest?.labels).toEqual([{ name: "label-0", color: "ff0000" }]);
    expect(secondPullRequest?.labels).toEqual([{ name: "label-0", color: "ff0000" }]);
    expect(first.fingerprint).toBe(second.fingerprint);

    const changedComparisonRequest = createRepositoryRequest({
      ...fixture,
      pullRequests: fixture.pullRequests.map((pullRequest) => ({
        ...pullRequest,
        aheadBy: 1,
      })),
    });
    const changedComparison = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: changedComparisonRequest.requestGraphql,
      requestGraphqlPartial: changedComparisonRequest.requestGraphqlPartial,
    });
    expect(changedComparison.fingerprint).not.toBe(first.fingerprint);
  });

  it("accepts a rename or transfer only when the repository database identity matches", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      repositoryFullName: "new-owner/new-name",
    };
    const successfulRequest = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: successfulRequest.requestGraphql,
      requestGraphqlPartial: successfulRequest.requestGraphqlPartial,
    });

    expect(result.repositoryFullName).toBe("new-owner/new-name");
    expect(successfulRequest.observations.requestedRepositoryIds).toEqual(["R_base"]);

    const mismatchedRequest = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "99",
        pageSize: 50,
        requestGraphql: mismatchedRequest.requestGraphql,
        requestGraphqlPartial: mismatchedRequest.requestGraphqlPartial,
      }),
    ).rejects.toThrow("GitHub returned another repository.");
    expect(mismatchedRequest.observations.branchPageSizes).toEqual([50]);
  });

  it("changes the fingerprint when an empty repository is renamed", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      defaultBranch: null,
      branches: [],
    };
    const beforeRenameRequest = createRepositoryRequest(fixture);
    const beforeRename = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: beforeRenameRequest.requestGraphql,
      requestGraphqlPartial: beforeRenameRequest.requestGraphqlPartial,
    });
    const afterRenameRequest = createRepositoryRequest({
      ...fixture,
      repositoryFullName: "new-owner/new-name",
    });
    const afterRename = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: afterRenameRequest.requestGraphql,
      requestGraphqlPartial: afterRenameRequest.requestGraphqlPartial,
    });

    expect(beforeRename.items).toEqual([]);
    expect(afterRename.items).toEqual([]);
    expect(afterRename.fingerprint).not.toBe(beforeRename.fingerprint);
  });

  it("retries instead of publishing mismatched branch and pull request heads", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        ...makeBaseFixture().branches,
        {
          id: "REF_feature",
          name: "feature",
          sha: "feature-before-push",
          checkCount: 0,
        },
      ],
      pullRequests: [
        {
          id: "PR_feature",
          number: 1,
          title: "Pushed during collection",
          headRefName: "feature",
          headRefOid: "feature-after-push",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 1,
          deletions: 1,
          changedFiles: 1,
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:02:00Z",
        },
      ],
    };

    const request = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("branch and pull request heads changed");
  });

  it("rejects equal-count branch churn found by the final signature pass", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        ...makeBaseFixture().branches,
        {
          id: "REF_zeta",
          name: "zeta",
          sha: "zeta-sha",
          checkCount: 0,
        },
      ],
      verificationBranches: [
        {
          id: "REF_alpha",
          name: "alpha",
          sha: "alpha-sha",
          checkCount: 0,
        },
        ...makeBaseFixture().branches,
      ],
    };

    const request = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("branch inventory changed");
  });

  it("rejects a branch head change found by the final signature pass", async () => {
    const feature: FixtureBranch = {
      id: "REF_feature",
      name: "feature",
      sha: "feature-before-push",
      checkCount: 0,
    };
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [...makeBaseFixture().branches, feature],
      verificationBranches: [
        ...makeBaseFixture().branches,
        { ...feature, sha: "feature-after-push" },
      ],
    };

    const request = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("branch inventory changed");
  });

  it("rejects equal-count open pull request churn found by the final identity pass", async () => {
    const collectedPullRequest: FixturePullRequest = {
      id: "PR_old",
      number: 1,
      title: "Collected pull request",
      headRefName: "main",
      headRefOid: "main-sha",
      headRepositoryId: "R_base",
      headRepositoryFullName: "samebase/samebase",
      isDraft: false,
      isCrossRepository: false,
      additions: 2,
      deletions: 1,
      changedFiles: 1,
      labelCount: 0,
      checkCount: 0,
      updatedAt: "2026-07-15T10:02:00Z",
    };
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      pullRequests: [collectedPullRequest],
      verificationPullRequests: [
        {
          ...collectedPullRequest,
          id: "PR_new",
          number: 2,
          title: "New pull request",
        },
      ],
    };

    const request = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("pull request inventory changed");
  });

  it("rejects pull request metadata changes found by the final signature pass", async () => {
    const pullRequest: FixturePullRequest = {
      id: "PR_one",
      number: 1,
      title: "Changes during collection",
      headRefName: "main",
      headRefOid: "main-sha",
      headRepositoryId: "R_base",
      headRepositoryFullName: "samebase/samebase",
      isDraft: false,
      isCrossRepository: false,
      additions: 2,
      deletions: 1,
      changedFiles: 1,
      labelCount: 0,
      checkCount: 0,
      updatedAt: "2026-07-15T10:02:00Z",
    };
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      pullRequests: [pullRequest],
      verificationPullRequests: [{ ...pullRequest, updatedAt: "2026-07-15T10:03:00Z" }],
    };

    const request = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("pull request inventory changed");
  });

  it.each<{
    axis: string;
    change: (pullRequest: FixturePullRequest) => FixturePullRequest;
  }>([
    {
      axis: "commit",
      change: (pullRequest) => ({ ...pullRequest, headRefOid: "new-main-sha" }),
    },
    {
      axis: "branch alias",
      change: (pullRequest) => ({ ...pullRequest, headRefName: "renamed-main" }),
    },
    {
      axis: "base branch",
      change: (pullRequest) => ({ ...pullRequest, baseRefName: "release" }),
    },
    {
      axis: "head repository",
      change: (pullRequest) => ({
        ...pullRequest,
        headRepositoryId: "R_fork",
        headRepositoryFullName: "contributor/samebase",
      }),
    },
  ])(
    "rejects a pull request $axis change found by the final signature pass",
    async ({ change }) => {
      const pullRequest: FixturePullRequest = {
        id: "PR_one",
        number: 1,
        title: "Head changes during collection",
        headRefName: "main",
        headRefOid: "main-sha",
        headRepositoryId: "R_base",
        headRepositoryFullName: "samebase/samebase",
        isDraft: false,
        isCrossRepository: false,
        additions: 2,
        deletions: 1,
        changedFiles: 1,
        labelCount: 0,
        checkCount: 0,
        updatedAt: "2026-07-15T10:02:00Z",
      };
      const fixture: RepositoryFixture = {
        ...makeBaseFixture(),
        pullRequests: [pullRequest],
        verificationPullRequests: [change(pullRequest)],
      };

      const request = createRepositoryRequest(fixture);
      await expect(
        collectRepositoryInventory({
          repositoryNodeId: "R_base",
          expectedRepositoryDatabaseId: "42",
          pageSize: 50,
          requestGraphql: request.requestGraphql,
          requestGraphqlPartial: request.requestGraphqlPartial,
        }),
      ).rejects.toThrow("pull request inventory changed");
    },
  );

  it.each<{
    name: string;
    change: (run: FixtureCloudflareCheckRun) => FixtureCloudflareCheckRun;
  }>([
    {
      name: "identity",
      change: (run) => ({ ...run, id: "run-after" }),
    },
    {
      name: "state",
      change: (run) => ({ ...run, status: "IN_PROGRESS", conclusion: null }),
    },
    {
      name: "summary",
      change: (run) => ({ ...run, summary: `${run.summary ?? ""}\nProvider note: changed` }),
    },
  ])("rejects a Cloudflare $name change found by the final signature pass", async ({ change }) => {
    const base = makeBaseFixture();
    const main = base.branches.at(0);
    if (main === undefined) {
      throw new Error("Expected the base fixture default branch.");
    }
    const collectedRun = makeWorkerBuild({
      id: "run-before",
      workerName: "web",
      branchAliasUrl: "https://main-web.workers.dev/",
    });
    const collectedBranch: FixtureBranch = {
      ...main,
      checkCount: 1,
      cloudflareSuites: [
        {
          id: "suite-main",
          branchName: "main",
          checkRuns: [collectedRun],
        },
      ],
    };
    const fixture: RepositoryFixture = {
      ...base,
      branches: [collectedBranch],
      verificationBranches: [
        {
          ...collectedBranch,
          cloudflareSuites: [
            {
              id: "suite-main",
              branchName: "main",
              checkRuns: [change(collectedRun)],
            },
          ],
        },
      ],
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("Cloudflare build observations changed");
  });

  it("rejects aggregate check changes found by the final signature pass", async () => {
    const pullRequest: FixturePullRequest = {
      id: "PR_one",
      number: 1,
      title: "Checks change during collection",
      headRefName: "contribution",
      headRefOid: "fork-sha",
      headRepositoryId: "R_fork",
      headRepositoryFullName: "contributor/samebase",
      isDraft: false,
      isCrossRepository: true,
      additions: 2,
      deletions: 1,
      changedFiles: 1,
      labelCount: 0,
      checkCount: 1,
      rollupState: "PENDING",
      updatedAt: "2026-07-15T10:02:00Z",
    };
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      pullRequests: [pullRequest],
      verificationPullRequests: [{ ...pullRequest, rollupState: "SUCCESS" }],
    };

    const request = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("pull request inventory changed");
  });

  it("rejects aggregate check-count changes found by the final branch signature pass", async () => {
    const main = makeBaseFixture().branches.at(0);
    if (main === undefined) {
      throw new Error("Expected the base fixture default branch.");
    }
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [{ ...main, checkCount: 1 }],
      verificationBranches: [{ ...main, checkCount: 2 }],
    };

    const request = createRepositoryRequest(fixture);
    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("branch inventory changed");
  });

  it("treats branch names as exact-case identities", async () => {
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branches: [
        {
          id: "REF_main",
          name: "main",
          sha: "main-sha",
          checkCount: 0,
        },
        {
          id: "REF_Feature",
          name: "Feature",
          sha: "upper-feature-sha",
          checkCount: 0,
        },
        {
          id: "REF_feature",
          name: "feature",
          sha: "lower-feature-sha",
          checkCount: 0,
        },
      ],
      pullRequests: [
        {
          id: "PR_upper",
          number: 1,
          title: "Upper-case feature",
          headRefName: "Feature",
          headRefOid: "upper-feature-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 3,
          deletions: 1,
          changedFiles: 1,
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:02:00Z",
        },
        {
          id: "PR_lower",
          number: 2,
          title: "Lower-case feature",
          headRefName: "feature",
          headRefOid: "lower-feature-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 4,
          deletions: 1,
          changedFiles: 1,
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:03:00Z",
        },
        {
          id: "PR_mismatch",
          number: 3,
          title: "Mismatched branch case",
          headRefName: "FEATURE",
          headRefOid: "mismatched-feature-sha",
          headRepositoryId: "R_base",
          headRepositoryFullName: "samebase/samebase",
          isDraft: false,
          isCrossRepository: false,
          additions: 5,
          deletions: 1,
          changedFiles: 1,
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:04:00Z",
        },
      ],
    };

    const request = createRepositoryRequest(fixture);
    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: request.requestGraphql,
      requestGraphqlPartial: request.requestGraphqlPartial,
    });

    expect(
      result.items
        .filter((item) => item.kind === "branch")
        .map((item) => item.name)
        .sort(),
    ).toEqual(["Feature", "feature", "main"]);
    const pullRequests = result.items.filter((item) => item.kind === "pull_request");
    expect(
      pullRequests.find((pullRequest) => pullRequest.rowKey === "pull-request:PR_upper")
        ?.canOpenInSamebase,
    ).toBe(true);
    expect(
      pullRequests.find((pullRequest) => pullRequest.rowKey === "pull-request:PR_lower")
        ?.canOpenInSamebase,
    ).toBe(true);
    expect(
      pullRequests.find((pullRequest) => pullRequest.rowKey === "pull-request:PR_mismatch")
        ?.canOpenInSamebase,
    ).toBe(false);
  });

  it("fails a generation instead of reading more than 1,000 pages from one connection", async () => {
    const branches: FixtureBranch[] = Array.from({ length: 1_001 }, (_, index) => ({
      id: `REF_${index}`,
      name: index === 0 ? "main" : `branch-${index}`,
      sha: `sha-${index}`,
      checkCount: 0,
    }));
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
      branchPageWidth: 1,
      branches,
    };
    const request = createRepositoryRequest(fixture);

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: fixture.repositoryId,
        expectedRepositoryDatabaseId: fixture.repositoryDatabaseId,
        pageSize: 50,
        requestGraphql: request.requestGraphql,
        requestGraphqlPartial: request.requestGraphqlPartial,
      }),
    ).rejects.toThrow("GitHub pagination exceeded its safety limit.");
  });

  it("rejects an empty cursor when GitHub reports another page", async () => {
    const requestGraphql: RepositoryInventoryGraphqlRequest = async () => ({
      repository: {
        id: "R_base",
        databaseId: 42,
        nameWithOwner: "samebase/samebase",
        defaultBranchRef: null,
        refs: {
          totalCount: 1,
          pageInfo: { hasNextPage: true, endCursor: "" },
          nodes: [],
        },
      },
    });
    const requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest = async (
      query,
      variables,
    ) => ({
      data: await requestGraphql(query, variables),
      errors: [],
    });

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql,
        requestGraphqlPartial,
      }),
    ).rejects.toThrow("GitHub pagination reported another page without a cursor.");
  });
});
