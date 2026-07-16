import { describe, expect, it } from "vite-plus/test";

import {
  buildRepositoryInventoryCheckSummaryFromCounts,
  normalizeCloudflareBuildCheckRun,
  normalizeCommitCheckRun,
  normalizeCommitStatus,
} from "./commitChecks";

const SUCCESSFUL_WORKERS_SUMMARY = `Preview URL: https://fc4977af-noter-worker.nicuchiciuc.workers.dev
Preview Alias URL: https://codex-samebase-rebrand-rollout-plan-noter-worker.nicuchiciuc.workers.dev
Build ID: [5f9b6f2e-1e10-4062-988f-56b734c8c7a9](https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9)
Script: [noter-worker](https://dash.cloudflare.com/workers/services/view/noter-worker)
Version ID: d5b7c5f1-4ddf-4930-a398-3f26f6d00a19`;

describe("buildRepositoryInventoryCheckSummaryFromCounts", () => {
  it("maps every GitHub aggregate outcome into the five compact summary buckets", () => {
    expect(
      buildRepositoryInventoryCheckSummaryFromCounts({
        totalCount: 19,
        checkRunCount: 14,
        statusContextCount: 5,
        checkRunCountsByState: [
          { state: "SUCCESS", count: 1 },
          { state: "ACTION_REQUIRED", count: 1 },
          { state: "CANCELLED", count: 1 },
          { state: "FAILURE", count: 1 },
          { state: "STALE", count: 1 },
          { state: "STARTUP_FAILURE", count: 1 },
          { state: "TIMED_OUT", count: 1 },
          { state: "IN_PROGRESS", count: 1 },
          { state: "PENDING", count: 1 },
          { state: "QUEUED", count: 1 },
          { state: "WAITING", count: 1 },
          { state: "NEUTRAL", count: 1 },
          { state: "SKIPPED", count: 1 },
          { state: "COMPLETED", count: 1 },
        ],
        statusContextCountsByState: [
          { state: "SUCCESS", count: 1 },
          { state: "ERROR", count: 1 },
          { state: "FAILURE", count: 1 },
          { state: "EXPECTED", count: 1 },
          { state: "PENDING", count: 1 },
        ],
      }),
    ).toEqual({
      state: "failure",
      totalCount: 19,
      checkRunCount: 14,
      statusContextCount: 5,
      successCount: 2,
      failureCount: 8,
      runningCount: 6,
      neutralCount: 2,
      unknownCount: 1,
    });
  });

  it("summarizes 101 checks from fixed aggregate counts without expanding check rows", () => {
    expect(
      buildRepositoryInventoryCheckSummaryFromCounts({
        totalCount: 101,
        checkRunCount: 101,
        statusContextCount: 0,
        checkRunCountsByState: [
          { state: "SUCCESS", count: 99 },
          { state: "SKIPPED", count: 2 },
        ],
        statusContextCountsByState: [],
      }),
    ).toEqual({
      state: "success",
      totalCount: 101,
      checkRunCount: 101,
      statusContextCount: 0,
      successCount: 99,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 2,
      unknownCount: 0,
    });
  });

  it("rejects duplicate aggregate states", () => {
    expect(() =>
      buildRepositoryInventoryCheckSummaryFromCounts({
        totalCount: 2,
        checkRunCount: 2,
        statusContextCount: 0,
        checkRunCountsByState: [
          { state: "SUCCESS", count: 1 },
          { state: "success", count: 1 },
        ],
        statusContextCountsByState: [],
      }),
    ).toThrow("GitHub returned a duplicate check aggregate state.");
  });

  it.each([
    { count: -1, compensatingCount: 2, totalCount: 1 },
    { count: 1.5, compensatingCount: 0.5, totalCount: 2 },
  ])("rejects the invalid aggregate count $count", ({ count, compensatingCount, totalCount }) => {
    expect(() =>
      buildRepositoryInventoryCheckSummaryFromCounts({
        totalCount,
        checkRunCount: totalCount,
        statusContextCount: 0,
        checkRunCountsByState: [
          { state: "SUCCESS", count },
          { state: "SKIPPED", count: compensatingCount },
        ],
        statusContextCountsByState: [],
      }),
    ).toThrow("GitHub returned an invalid check aggregate count.");
  });

  it("rejects aggregate totals that do not match their typed counts", () => {
    expect(() =>
      buildRepositoryInventoryCheckSummaryFromCounts({
        totalCount: 2,
        checkRunCount: 2,
        statusContextCount: 0,
        checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
        statusContextCountsByState: [],
      }),
    ).toThrow("GitHub returned inconsistent check aggregate counts.");
  });
});

describe("normalizeCloudflareBuildCheckRun", () => {
  it("preserves the fixture's immutable version and mutable branch alias", () => {
    expect(
      normalizeCloudflareBuildCheckRun({
        id: 87650938033,
        name: "Workers Builds: shared-convex-monorepo-fixture-web",
        status: "completed",
        conclusion: "success",
        branchName: "codex-shared-backend-preview",
        detailsUrl: "https://dash.cloudflare.com/builds/cdf73184-dd02-48b3-9f2e-765d0ae872d0",
        htmlUrl: "https://github.com/samebase/shared-convex-monorepo-fixture/runs/87650938033",
        outputSummary: `Build ID: [cdf73184-dd02-48b3-9f2e-765d0ae872d0](https://dash.cloudflare.com/builds/cdf73184-dd02-48b3-9f2e-765d0ae872d0)
Script: [shared-convex-monorepo-fixture-web](https://dash.cloudflare.com/workers/services/view/shared-convex-monorepo-fixture-web)
Version ID: adde3b26-f4a1-40fc-a588-28058db5a1e0
Preview URL: https://adde3b26-shared-convex-monorepo-fixture-web.pfp.workers.dev
Preview Alias URL: https://codex-shared-backend-shared-convex-monorepo-fixture-web.pfp.workers.dev`,
        startedAt: "2026-07-16T14:34:31Z",
        completedAt: "2026-07-16T14:34:31Z",
      }),
    ).toEqual({
      sourceKey: "87650938033",
      checkName: "Workers Builds: shared-convex-monorepo-fixture-web",
      workerName: "shared-convex-monorepo-fixture-web",
      branch: { state: "known", name: "codex-shared-backend-preview" },
      rootDirectory: { state: "unknown" },
      state: "success",
      providerStatus: "completed",
      providerConclusion: "success",
      preview: {
        state: "ready",
        versionUrl: "https://adde3b26-shared-convex-monorepo-fixture-web.pfp.workers.dev/",
        branchAlias: {
          state: "ready",
          branchName: "codex-shared-backend-preview",
          url: "https://codex-shared-backend-shared-convex-monorepo-fixture-web.pfp.workers.dev/",
        },
      },
      providerBuildId: "cdf73184-dd02-48b3-9f2e-765d0ae872d0",
      detailsUrl: "https://dash.cloudflare.com/builds/cdf73184-dd02-48b3-9f2e-765d0ae872d0",
      githubUrl: "https://github.com/samebase/shared-convex-monorepo-fixture/runs/87650938033",
      startedAt: Date.parse("2026-07-16T14:34:31Z"),
      completedAt: Date.parse("2026-07-16T14:34:31Z"),
    });
  });

  it("makes a failed build without a URL explicitly unavailable", () => {
    expect(
      normalizeCloudflareBuildCheckRun({
        id: "failed",
        name: "Workers Builds: api",
        status: "completed",
        conclusion: "failure",
      }),
    ).toMatchObject({
      state: "failure",
      preview: { state: "unavailable" },
    });
  });

  it("keeps a valid preview ready even when the build later failed", () => {
    expect(
      normalizeCloudflareBuildCheckRun({
        id: "failed-after-preview",
        name: "Workers Builds: api",
        status: "completed",
        conclusion: "failure",
        outputSummary: "Preview URL: https://immutable-api.example.workers.dev",
      }),
    ).toMatchObject({
      state: "failure",
      preview: {
        state: "ready",
        versionUrl: "https://immutable-api.example.workers.dev/",
        branchAlias: { state: "not_provided" },
      },
    });
  });

  it("does not present a branch alias as ready when GitHub omitted its branch", () => {
    expect(
      normalizeCloudflareBuildCheckRun({
        id: "unknown-branch",
        name: "Workers Builds: api",
        status: "completed",
        conclusion: "success",
        outputSummary: `Preview URL: https://immutable-api.example.workers.dev
Preview Alias URL: https://unknown-branch-api.example.workers.dev`,
      }),
    ).toMatchObject({
      branch: { state: "unknown" },
      preview: {
        state: "ready",
        branchAlias: {
          state: "provider_unknown",
          reason: "branch_unavailable",
          providerUrl: "https://unknown-branch-api.example.workers.dev/",
        },
      },
    });
  });

  it("marks a successful build with no preview evidence as provider unknown", () => {
    expect(
      normalizeCloudflareBuildCheckRun({
        id: "missing-preview",
        name: "Workers Builds: api",
        status: "completed",
        conclusion: "success",
      }),
    ).toMatchObject({
      state: "success",
      preview: { state: "provider_unknown" },
    });
  });

  it("falls back to the Workers Builds check-name suffix when Script is absent", () => {
    expect(
      normalizeCloudflareBuildCheckRun({
        id: "worker-name-fallback",
        name: "Workers Builds: fallback-worker",
        status: "queued",
      }),
    ).toMatchObject({
      workerName: "fallback-worker",
      preview: { state: "pending" },
    });
  });
});

describe("normalizeCommitCheckRun", () => {
  it.each(["queued", "in_progress", "pending", "requested", "waiting"])(
    "classifies GitHub's %s check status as running",
    (status) => {
      expect(
        normalizeCommitCheckRun({
          id: status,
          name: "GitHub Actions",
          status,
        }),
      ).toMatchObject({ state: "running", status });
    },
  );

  it("normalizes a check run without copying provider-specific build output", () => {
    expect(
      normalizeCommitCheckRun({
        id: 154,
        name: "Workers Builds: noter-worker",
        status: "completed",
        conclusion: "success",
        appName: "Cloudflare Workers and Pages",
        detailsUrl: "https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9",
        htmlUrl: "https://github.com/samebase/samebase/runs/154",
        outputSummary: SUCCESSFUL_WORKERS_SUMMARY,
        startedAt: "2026-06-23T10:00:00Z",
        completedAt: "2026-06-23T10:02:00Z",
      }),
    ).toEqual({
      source: "check_run",
      sourceKey: "154",
      name: "Workers Builds: noter-worker",
      providerName: "Cloudflare Workers and Pages",
      state: "success",
      status: "completed",
      conclusion: "success",
      targetUrl: "https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9",
      githubUrl: "https://github.com/samebase/samebase/runs/154",
      startedAt: Date.parse("2026-06-23T10:00:00Z"),
      completedAt: Date.parse("2026-06-23T10:02:00Z"),
      updatedAt: Date.parse("2026-06-23T10:02:00Z"),
    });
  });

  it("keeps a failed check's own target without parsing its output", () => {
    expect(
      normalizeCommitCheckRun({
        id: 155,
        name: "Workers Builds: samebase",
        status: "completed",
        conclusion: "failure",
        detailsUrl: "https://dash.cloudflare.com/builds/failed-build",
        outputSummary: "Build ID: [failed-build](https://dash.cloudflare.com/builds/failed-build)",
        startedAt: "2026-06-23T10:00:00Z",
        completedAt: "2026-06-23T10:01:00Z",
      }),
    ).toMatchObject({
      source: "check_run",
      sourceKey: "155",
      state: "failure",
      targetUrl: "https://dash.cloudflare.com/builds/failed-build",
      updatedAt: Date.parse("2026-06-23T10:01:00Z"),
    });
  });

  it("rejects a non-https target URL", () => {
    expect(
      normalizeCommitCheckRun({
        id: 156,
        name: "Workers Builds: samebase",
        status: "completed",
        conclusion: "success",
        detailsUrl: "http://dash.cloudflare.com/insecure",
        outputSummary: `Preview URL: javascript:alert(1)
Preview Alias URL: http://branch.example.com`,
        completedAt: "2026-06-23T10:02:00Z",
      }),
    ).toMatchObject({
      targetUrl: undefined,
      updatedAt: Date.parse("2026-06-23T10:02:00Z"),
    });
  });
});

describe("normalizeCommitStatus", () => {
  it("normalizes legacy commit statuses into the same snapshot vocabulary", () => {
    expect(
      normalizeCommitStatus({
        id: 99,
        state: "pending",
        context: "netlify/deploy-preview",
        description: "Deploy preview started",
        targetUrl: "https://app.netlify.com/sites/example/deploys/99",
        updatedAt: "2026-06-23T10:03:00Z",
      }),
    ).toEqual({
      source: "commit_status",
      sourceKey: "99",
      name: "netlify/deploy-preview",
      state: "running",
      status: "pending",
      conclusion: "Deploy preview started",
      targetUrl: "https://app.netlify.com/sites/example/deploys/99",
      updatedAt: Date.parse("2026-06-23T10:03:00Z"),
    });
  });
});
