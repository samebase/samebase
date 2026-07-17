import { describe, expect, it } from "vite-plus/test";

import { buildRepositoryPullRequestPage } from "./repositoryPullRequests";
import type { GitHubPullRequestPage } from "./githubPullRequests";

function providerPage(): GitHubPullRequestPage {
  return {
    repositoryNodeId: "R_base",
    repositoryDatabaseId: "42",
    repositoryFullName: "samebase/samebase",
    defaultBranch: {
      name: "main",
      headCommit: {
        nodeId: "C_main",
        repositoryNodeId: "R_base",
        sha: "main-sha",
        checks: {
          rollupState: "SUCCESS",
          totalCount: 1,
          checkRunCount: 1,
          statusContextCount: 0,
          checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
          statusContextCountsByState: [],
        },
      },
    },
    providerOpenPullRequestCount: 100,
    scannedPullRequestCount: 2,
    providerSequenceDrifted: false,
    pullRequests: [
      {
        nodeId: "PR_1",
        number: 1,
        title: "Observe the current head",
        url: "https://github.com/samebase/samebase/pull/1",
        isDraft: false,
        isCrossRepository: false,
        additions: 12,
        deletions: 4,
        changedFiles: 3,
        updatedAt: "2026-07-17T10:00:00.000Z",
        baseRefName: "main",
        headRefName: "feature/current-head",
        headRefOid: "head-sha",
        headRepository: {
          nodeId: "R_base",
          nameWithOwner: "samebase/samebase",
          owner: "samebase",
        },
        labels: [{ name: "ready", color: "1a7f37" }],
        headCommit: {
          nodeId: "C_head",
          repositoryNodeId: "R_base",
          sha: "head-sha",
          checks: {
            rollupState: null,
            totalCount: 0,
            checkRunCount: 0,
            statusContextCount: 0,
            checkRunCountsByState: [],
            statusContextCountsByState: [],
          },
        },
      },
    ],
    continuation: {
      kind: "scan_guardrail",
      cursor: "cursor-2",
      scannedProviderPages: 4,
    },
    rateUsage: {
      cost: 2,
      limit: 5_000,
      remaining: 4_998,
      resetAt: 1_800_000_000_000,
    },
    requestCount: 2,
  };
}

describe("buildRepositoryPullRequestPage", () => {
  it("preserves one exact PR identity and explicit no-checks", () => {
    const result = buildRepositoryPullRequestPage({
      observedAt: 1_700_000_000_000,
      page: providerPage(),
    });

    expect(result.defaultBranch).toMatchObject({
      state: "ready",
      name: "main",
      checks: { state: "success", totalCount: 1 },
    });
    expect(result.pullRequests).toMatchObject([
      {
        nodeId: "PR_1",
        headRefName: "feature/current-head",
        checks: { state: "none", totalCount: 0 },
        head: {
          baseRepositoryNodeId: "R_base",
          pullRequestNodeId: "PR_1",
          headRepositoryNodeId: "R_base",
          headRefName: "feature/current-head",
          headCommitNodeId: "C_head",
          headOid: "head-sha",
        },
      },
    ]);
    expect(result.continuation).toEqual({
      kind: "scan_guardrail",
      cursor: "cursor-2",
      scannedProviderPages: 4,
    });
    expect(result.freshUntil).toBe(1_700_000_060_000);
    expect(result.providerSequenceDrifted).toBe(false);
  });

  it("represents an empty repository default branch explicitly", () => {
    const page = providerPage();
    page.defaultBranch = null;

    expect(
      buildRepositoryPullRequestPage({
        observedAt: 1_700_000_000_000,
        page,
      }).defaultBranch,
    ).toEqual({ state: "absent" });
  });
});
