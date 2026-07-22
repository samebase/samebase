import { describe, expect, it } from "vite-plus/test";

import type { RepositoryPullRequest } from "../../convex/repositoryPullRequests";
import { summarizePullRequestChecks } from "./pullRequestChecks";

type StatusCheckRollup = NonNullable<RepositoryPullRequest["statusCheckRollup"]>;

describe("summarizePullRequestChecks", () => {
  it("keeps no checks distinct from a successful rollup", () => {
    expect(summarizePullRequestChecks(null)).toEqual({
      state: "none",
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 0,
    });
  });

  it("derives presentation state from GitHub's native grouped counts", () => {
    const rollup = {
      state: "PENDING",
      contexts: {
        totalCount: 5,
        checkRunCount: 4,
        statusContextCount: 1,
        checkRunCountsByState: [
          { state: "SUCCESS", count: 2 },
          { state: "IN_PROGRESS", count: 1 },
          { state: "NEUTRAL", count: 1 },
        ],
        statusContextCountsByState: [{ state: "FAILURE", count: 1 }],
        nodes: [],
      },
    } satisfies StatusCheckRollup;

    expect(summarizePullRequestChecks(rollup)).toEqual({
      state: "failure",
      totalCount: 5,
      successCount: 2,
      failureCount: 1,
      runningCount: 1,
      neutralCount: 1,
      unknownCount: 0,
    });
  });

  it("surfaces provider states that were normalized to unknown", () => {
    const rollup = {
      state: "UNKNOWN",
      contexts: {
        totalCount: 2,
        checkRunCount: 1,
        statusContextCount: 1,
        checkRunCountsByState: [{ state: "UNKNOWN", count: 1 }],
        statusContextCountsByState: [{ state: "UNKNOWN", count: 1 }],
        nodes: [],
      },
    } satisfies StatusCheckRollup;

    expect(summarizePullRequestChecks(rollup)).toEqual({
      state: "unknown",
      totalCount: 2,
      successCount: 0,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 2,
    });
  });
});
