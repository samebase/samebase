import { describe, expect, it } from "vite-plus/test";

import type { RepositoryStatusCheckRollup } from "../../convex/repositoryPullRequests";
import {
  formatRepositoryCheckSummary,
  type RepositoryCheckSummary,
  summarizeRepositoryChecks,
} from "./repositoryChecks";

type StatusCheckRollup = NonNullable<RepositoryStatusCheckRollup>;

describe("summarizeRepositoryChecks", () => {
  it("keeps no checks distinct from a successful rollup", () => {
    expect(summarizeRepositoryChecks(null)).toEqual({
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

    expect(summarizeRepositoryChecks(rollup)).toEqual({
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
      contexts: {
        totalCount: 2,
        checkRunCount: 1,
        statusContextCount: 1,
        checkRunCountsByState: [{ state: "UNKNOWN", count: 1 }],
        statusContextCountsByState: [{ state: "UNKNOWN", count: 1 }],
        nodes: [],
      },
    } satisfies StatusCheckRollup;

    expect(summarizeRepositoryChecks(rollup)).toEqual({
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

describe("formatRepositoryCheckSummary", () => {
  const summary = {
    failureCount: 0,
    neutralCount: 0,
    runningCount: 0,
    successCount: 0,
    totalCount: 0,
    unknownCount: 0,
  };

  it.each([
    [{ ...summary, state: "none" }, "No checks"],
    [{ ...summary, state: "success", successCount: 4, totalCount: 4 }, "4/4 passed"],
    [{ ...summary, state: "failure", failureCount: 2, totalCount: 6 }, "2/6 failed"],
    [{ ...summary, state: "running", runningCount: 3, totalCount: 8 }, "3/8 pending"],
    [{ ...summary, state: "neutral", neutralCount: 2, totalCount: 2 }, "2/2 neutral"],
    [{ ...summary, state: "unknown", totalCount: 5, unknownCount: 1 }, "1/5 unknown"],
  ] satisfies readonly [RepositoryCheckSummary, string][])("formats %j as %s", (checks, label) => {
    expect(formatRepositoryCheckSummary(checks)).toBe(label);
  });
});
