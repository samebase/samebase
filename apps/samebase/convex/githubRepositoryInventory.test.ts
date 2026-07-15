import { describe, expect, it } from "vite-plus/test";

import {
  collectRepositoryInventory,
  type RepositoryInventoryGraphqlRequest,
} from "./githubRepositoryInventory";

type FixtureBranch = {
  id: string;
  name: string;
  sha: string;
  checkCount: number;
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
    statusCheckRollup: {
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
    baseRefName: fixture.defaultBranch,
    headRefName: pullRequest.headRefName,
    headRefOid: pullRequest.headRefOid,
    headRepository: {
      id: pullRequest.headRepositoryId,
      nameWithOwner: pullRequest.headRepositoryFullName,
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
  observations: RequestObservations;
} {
  const observations: RequestObservations = {
    branchPageSizes: [],
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
          defaultBranchRef: fixture.defaultBranch === null ? null : { name: fixture.defaultBranch },
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

  return { requestGraphql, observations };
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
          labelCount: 0,
          checkCount: 0,
          updatedAt: "2026-07-15T10:03:00Z",
        },
      ],
    };
    const { observations, requestGraphql } = createRepositoryRequest(fixture);

    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql,
    });

    expect(result.branchCount).toBe(2);
    expect(result.pullRequestCount).toBe(2);
    expect(result.items).toHaveLength(4);

    const main = result.items.find((item) => item.kind === "branch" && item.name === "main");
    if (!main || main.kind !== "branch") {
      throw new Error("Expected the main branch.");
    }
    expect(main.isDefault).toBe(true);
    expect(main.headCommit.checks).toMatchObject({
      state: "success",
      totalCount: 101,
      checkRunCount: 101,
      successCount: 101,
    });

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
    expect(forkPullRequest.labels).toEqual([]);
    expect(observations.branchVerificationPasses).toBe(1);
    expect(observations.pullRequestVerificationPasses).toBe(1);
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

    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: createRepositoryRequest(fixture).requestGraphql,
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
    const first = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: createRepositoryRequest(fixture).requestGraphql,
    });
    const second = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: createRepositoryRequest(fixture).requestGraphql,
    });

    expect(first.items).toEqual(second.items);
    const firstPullRequest = first.items.find((item) => item.kind === "pull_request");
    const secondPullRequest = second.items.find((item) => item.kind === "pull_request");
    expect(firstPullRequest?.labels).toEqual([{ name: "label-0", color: "ff0000" }]);
    expect(secondPullRequest?.labels).toEqual([{ name: "label-0", color: "ff0000" }]);
    expect(first.fingerprint).toBe(second.fingerprint);
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
    const beforeRename = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: createRepositoryRequest(fixture).requestGraphql,
    });
    const afterRename = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: createRepositoryRequest({
        ...fixture,
        repositoryFullName: "new-owner/new-name",
      }).requestGraphql,
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

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: createRepositoryRequest(fixture).requestGraphql,
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

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: createRepositoryRequest(fixture).requestGraphql,
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

    await expect(
      collectRepositoryInventory({
        repositoryNodeId: "R_base",
        expectedRepositoryDatabaseId: "42",
        pageSize: 50,
        requestGraphql: createRepositoryRequest(fixture).requestGraphql,
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

    const result = await collectRepositoryInventory({
      repositoryNodeId: "R_base",
      expectedRepositoryDatabaseId: "42",
      pageSize: 50,
      requestGraphql: createRepositoryRequest(fixture).requestGraphql,
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
