import { describe, expect, it } from "vite-plus/test";

import {
  summarizeRepositoryChecks,
  type RepositoryCheck,
  type RepositoryStatusCheckRollup,
} from "../../../convex/repository/pullRequestModel";
import type { RepositoryCheckSummary } from "../../../shared/repositoryChecks";
import { formatRepositoryCheckSummary } from "./repositoryChecks";

type StatusCheckRollup = NonNullable<RepositoryStatusCheckRollup>;

function checkRun(
  name: string,
  status: Extract<RepositoryCheck, { kind: "check_run" }>["status"],
  conclusion: Extract<RepositoryCheck, { kind: "check_run" }>["conclusion"],
): RepositoryCheck {
  return {
    kind: "check_run",
    name,
    status,
    conclusion,
    detailsUrl: `https://github.com/samebase/samebase/actions/runs/1/job/${name}`,
    title: null,
  };
}

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

  it("counts each listed check by its state", () => {
    const rollup = {
      complete: true,
      checks: [
        checkRun("lint", "COMPLETED", "SUCCESS"),
        checkRun("test", "COMPLETED", "SUCCESS"),
        checkRun("e2e", "IN_PROGRESS", null),
        checkRun("preview", "COMPLETED", "NEUTRAL"),
        {
          kind: "status_context",
          context: "Cloudflare Workers",
          state: "FAILURE",
          targetUrl: "https://dash.cloudflare.com/builds/1",
          description: "Build failed",
        },
      ],
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
      complete: true,
      checks: [
        checkRun("lint", "COMPLETED", "UNKNOWN"),
        {
          kind: "status_context",
          context: "Cloudflare Workers",
          state: "UNKNOWN",
          targetUrl: null,
          description: null,
        },
      ],
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
