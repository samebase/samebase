import { describe, expect, it } from "vite-plus/test";

import {
  collectRepositoryInventory,
  type RepositoryInventoryGraphqlPartialRequest,
  type RepositoryInventoryGraphqlRequest,
} from "./githubRepositoryInventory";

type FixtureBranch = {
  id: string;
  name: string;
  sha: string;
  checkCount: number;
  aheadBy?: number;
  behindBy?: number;
  comparisonUnavailable?: boolean;
};

type FixturePullRequest = {
  id: string;
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
  checkCount: number;
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
};

type RequestObservations = {
  branchPageSizes: number[];
  pullRequestComparisonBatchSizes: number[];
  branchVerificationPasses: number;
  pullRequestVerificationPasses: number;
  requestedRepositoryIds: string[];
};

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

function makeCheckRun(commitNodeId: string, position: number) {
  return {
    __typename: "CheckRun",
    id: `${commitNodeId}-check-${position}`,
    name: `CI ${position}`,
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: `https://example.com/checks/${position}`,
    url: `https://github.com/checks/${position}`,
    summary: null,
    startedAt: "2026-07-15T10:00:00Z",
    completedAt: "2026-07-15T10:01:00Z",
    checkSuite: {
      app: {
        name: "Example CI",
        slug: "example-ci",
      },
    },
  };
}

function makeCheckPage(args: { commitNodeId: string; checkCount: number; start: number }) {
  const end = Math.min(args.start + 100, args.checkCount);
  return {
    totalCount: args.checkCount,
    checkRunCount: args.checkCount,
    statusContextCount: 0,
    pageInfo: pageInfo(
      end < args.checkCount,
      end < args.checkCount ? `check-${args.commitNodeId}:${end}` : null,
    ),
    nodes: Array.from({ length: end - args.start }, (_, index) =>
      makeCheckRun(args.commitNodeId, args.start + index),
    ),
  };
}

function makeCommit(args: {
  nodeId: string;
  sha: string;
  repositoryId: string;
  checkCount: number;
}) {
  return {
    id: args.nodeId,
    oid: args.sha,
    messageHeadline: `Commit ${args.sha}`,
    authoredDate: "2026-07-15T09:59:00Z",
    committedDate: "2026-07-15T10:00:00Z",
    repository: { id: args.repositoryId },
    statusCheckRollup:
      args.checkCount === 0
        ? null
        : {
            state: "SUCCESS",
            contexts: makeCheckPage({
              commitNodeId: args.nodeId,
              checkCount: args.checkCount,
              start: 0,
            }),
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
        nodeId: `${branch.id}-commit`,
        sha: branch.sha,
        repositoryId: fixture.repositoryId,
        checkCount: branch.checkCount,
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

function makeBranchSignatureNode(branch: FixtureBranch) {
  return { name: branch.name };
}

function makePullRequestSignatureNode(pullRequest: FixturePullRequest) {
  return { id: pullRequest.id };
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
            nodeId: `${pullRequest.id}-commit`,
            sha: pullRequest.headRefOid,
            repositoryId: pullRequest.headRepositoryId,
            checkCount: pullRequest.checkCount,
          }),
        },
      ],
    },
  };
}

function findCommit(fixture: RepositoryFixture, nodeId: string) {
  const branch = fixture.branches.find((candidate) => `${candidate.id}-commit` === nodeId);
  if (branch) {
    return {
      nodeId,
      sha: branch.sha,
      checkCount: branch.checkCount,
    };
  }
  const pullRequest = fixture.pullRequests.find((candidate) => `${candidate.id}-commit` === nodeId);
  if (pullRequest) {
    return {
      nodeId,
      sha: pullRequest.headRefOid,
      checkCount: pullRequest.checkCount,
    };
  }
  throw new Error(`Unknown commit node ${nodeId}.`);
}

function createRepositoryRequest(fixture: RepositoryFixture): {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
  observations: RequestObservations;
} {
  const observations: RequestObservations = {
    branchPageSizes: [],
    pullRequestComparisonBatchSizes: [],
    branchVerificationPasses: 0,
    pullRequestVerificationPasses: 0,
    requestedRepositoryIds: [],
  };
  const branchNodes = fixture.branches.map((branch) => makeBranchNode(fixture, branch));
  const branchSignatureNodes = (fixture.verificationBranches ?? fixture.branches).map(
    makeBranchSignatureNode,
  );
  const pullRequestNodes = fixture.pullRequests.map((pullRequest) =>
    makePullRequestNode(fixture, pullRequest),
  );
  const pullRequestSignatureNodes = (fixture.verificationPullRequests ?? fixture.pullRequests).map(
    makePullRequestSignatureNode,
  );

  const requestGraphql: RepositoryInventoryGraphqlRequest = async (query, variables) => {
    if (query.includes("query RepositoryInventoryBranchSignaturePage(")) {
      if (!query.includes("orderBy: { field: ALPHABETICAL, direction: ASC }")) {
        throw new Error("Expected stable alphabetical branch verification.");
      }
      const start = readCursor(variables, "branch-signature");
      if (start === 0) {
        observations.branchVerificationPasses += 1;
      }
      const page = slicePage({
        values: branchSignatureNodes,
        start,
        width: fixture.branchVerificationPageWidth ?? branchSignatureNodes.length,
        cursorPrefix: "branch-signature",
      });
      return {
        repository: {
          id: fixture.repositoryId,
          databaseId: Number(fixture.repositoryDatabaseId),
          nameWithOwner: fixture.repositoryFullName,
          defaultBranchRef: fixture.defaultBranch === null ? null : { name: fixture.defaultBranch },
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
      const start = readCursor(variables, "branch");
      const pageSize = requireNumberVariable(variables, "pageSize");
      if (start === 0) {
        observations.branchPageSizes.push(pageSize);
        observations.requestedRepositoryIds.push(requireStringVariable(variables, "repositoryId"));
      }
      const page = slicePage({
        values: branchNodes,
        start,
        width: fixture.branchPageWidth ?? branchNodes.length,
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
      const start = readCursor(variables, "pull-request-signature");
      if (start === 0) {
        observations.pullRequestVerificationPasses += 1;
      }
      const page = slicePage({
        values: pullRequestSignatureNodes,
        start,
        width: fixture.pullRequestVerificationPageWidth ?? pullRequestSignatureNodes.length,
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
      const start = readCursor(variables, "pull-request");
      const page = slicePage({
        values: pullRequestNodes,
        start,
        width: fixture.pullRequestPageWidth ?? pullRequestNodes.length,
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

    if (query.includes("query RepositoryInventoryCheckContinuation(")) {
      const nodeId = requireStringVariable(variables, "nodeId");
      const commit = findCommit(fixture, nodeId);
      return {
        node: {
          __typename: "Commit",
          oid: commit.sha,
          statusCheckRollup: {
            state: "SUCCESS",
            contexts: makeCheckPage({
              commitNodeId: nodeId,
              checkCount: commit.checkCount,
              start: readCursor(variables, `check-${nodeId}`),
            }),
          },
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
  it("collects every paginated branch, pull request, label, and check context", async () => {
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
      state: "success",
      totalCount: 101,
      checkRunCount: 101,
      successCount: 101,
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
    const fixture: RepositoryFixture = {
      ...makeBaseFixture(),
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
});
