import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  normalizeCloudflareBuild,
  summarizeChecks,
  type CloudflareBuild,
  type CloudflareBuildObservationResult,
  type CloudflareBuildPreview,
  type PullRequestHeadIdentity,
} from "./repositoryObservations";

describe("summarizeChecks", () => {
  it("reports an empty rollup as none", () => {
    expect(
      summarizeChecks({
        totalCount: 0,
        checkRunCount: 0,
        statusContextCount: 0,
        checkRunCountsByState: [],
        statusContextCountsByState: [],
      }),
    ).toEqual({
      state: "none",
      totalCount: 0,
      checkRunCount: 0,
      statusContextCount: 0,
      successCount: 0,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 0,
    });
  });

  it("summarizes 101 checks from fixed aggregate counts", () => {
    expect(
      summarizeChecks({
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

  it("maps GitHub aggregate outcomes into compact summary buckets", () => {
    expect(
      summarizeChecks({
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
    ).toMatchObject({
      state: "failure",
      successCount: 2,
      failureCount: 8,
      runningCount: 6,
      neutralCount: 2,
      unknownCount: 1,
    });
  });

  it("rejects aggregate states when the rollup says there are no checks", () => {
    expect(() =>
      summarizeChecks({
        totalCount: 0,
        checkRunCount: 0,
        statusContextCount: 0,
        checkRunCountsByState: [{ state: "SUCCESS", count: 0 }],
        statusContextCountsByState: [],
      }),
    ).toThrow("GitHub returned aggregate states for an empty check rollup.");
  });
});

describe("normalizeCloudflareBuild", () => {
  it("preserves the immutable version URL and mutable branch alias", () => {
    expect(
      normalizeCloudflareBuild({
        id: "CR_87650938033",
        name: "Workers Builds: shared-convex-monorepo-fixture-web",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        branch: { state: "known", name: "codex-shared-backend-preview" },
        rootDirectory: "apps/web",
        outputSummary: `Build ID: [cdf73184-dd02-48b3-9f2e-765d0ae872d0](https://dash.cloudflare.com/builds/cdf73184-dd02-48b3-9f2e-765d0ae872d0)
Script: [shared-convex-monorepo-fixture-web](https://dash.cloudflare.com/workers/services/view/shared-convex-monorepo-fixture-web)
Version ID: adde3b26-f4a1-40fc-a588-28058db5a1e0
Preview URL: https://adde3b26-shared-convex-monorepo-fixture-web.pfp.workers.dev
Preview Alias URL: https://codex-shared-backend-shared-convex-monorepo-fixture-web.pfp.workers.dev`,
      }),
    ).toEqual({
      state: "success",
      source: {
        state: "cloudflare_build",
        checkRunId: "CR_87650938033",
        buildId: "cdf73184-dd02-48b3-9f2e-765d0ae872d0",
      },
      checkName: "Workers Builds: shared-convex-monorepo-fixture-web",
      workerName: "shared-convex-monorepo-fixture-web",
      rootDirectory: { state: "known", value: "apps/web" },
      branch: { state: "known", name: "codex-shared-backend-preview" },
      providerStatus: "COMPLETED",
      providerConclusion: { state: "provided", value: "SUCCESS" },
      preview: {
        state: "ready",
        versionUrl: "https://adde3b26-shared-convex-monorepo-fixture-web.pfp.workers.dev/",
        branchAlias: {
          state: "ready",
          branchName: "codex-shared-backend-preview",
          url: "https://codex-shared-backend-shared-convex-monorepo-fixture-web.pfp.workers.dev/",
        },
      },
    });
  });

  it("makes a failed build without a URL explicitly unavailable", () => {
    expect(
      normalizeCloudflareBuild({
        id: "failed",
        name: "Workers Builds: api",
        status: "completed",
        conclusion: "failure",
        branch: { state: "unknown" },
      }),
    ).toMatchObject({
      state: "failure",
      preview: { state: "unavailable" },
    });
  });

  it("keeps a queued build pending before Cloudflare returns a build ID", () => {
    expect(
      normalizeCloudflareBuild({
        id: "queued-run",
        name: "Workers Builds: api",
        status: "queued",
        branch: { state: "unknown" },
      }),
    ).toMatchObject({
      state: "queued",
      source: { state: "github_check_run", checkRunId: "queued-run" },
      preview: { state: "pending" },
    });
  });

  it("marks an unrecognized provider state explicitly", () => {
    expect(
      normalizeCloudflareBuild({
        id: "unknown-state",
        name: "Workers Builds: api",
        status: "provider_added_a_new_state",
        branch: { state: "unknown" },
      }),
    ).toMatchObject({
      state: "provider_unknown",
      preview: {
        state: "provider_unknown",
        reason: "unrecognized_build_state",
      },
    });
  });

  it("marks an invalid preview URL as unknown provider output", () => {
    expect(
      normalizeCloudflareBuild({
        id: "invalid-preview",
        name: "Workers Builds: api",
        status: "completed",
        conclusion: "success",
        branch: { state: "known", name: "feature" },
        outputSummary: `Preview URL: http://insecure.example.workers.dev
Preview Alias URL: https://feature-api.example.workers.dev`,
      }),
    ).toMatchObject({
      state: "success",
      preview: {
        state: "provider_unknown",
        reason: "invalid_provider_output",
      },
    });
  });

  it("does not claim a branch alias belongs to a missing branch", () => {
    expect(
      normalizeCloudflareBuild({
        id: "unknown-branch",
        name: "Workers Builds: api",
        status: "completed",
        conclusion: "success",
        branch: { state: "unknown" },
        outputSummary: `Preview URL: https://immutable-api.example.workers.dev
Preview Alias URL: https://unknown-branch-api.example.workers.dev`,
      }),
    ).toMatchObject({
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
});

describe("observation validators", () => {
  it("encode build and preview combinations in the inferred validator type", () => {
    type SuccessBuild = Extract<CloudflareBuild, { state: "success" }>;
    type SuccessWithPendingPreview = Omit<SuccessBuild, "preview"> & {
      preview: { state: "pending" };
    };
    type QueuedBuild = Extract<CloudflareBuild, { state: "queued" }>;
    type QueuedWithReadyPreview = Omit<QueuedBuild, "preview"> & {
      preview: Extract<CloudflareBuildPreview, { state: "ready" }>;
    };

    expectTypeOf<SuccessWithPendingPreview>().not.toMatchTypeOf<CloudflareBuild>();
    expectTypeOf<QueuedWithReadyPreview>().not.toMatchTypeOf<CloudflareBuild>();
  });

  it("keeps exact heads and truthful action outcomes required", () => {
    expectTypeOf<PullRequestHeadIdentity["headRepositoryNodeId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<
      Extract<CloudflareBuildObservationResult, { state: "fresh_absence" }>
    >().toEqualTypeOf<{
      state: "fresh_absence";
      head: PullRequestHeadIdentity;
      observedAt: number;
    }>();
    expectTypeOf<CloudflareBuildObservationResult["state"]>().toEqualTypeOf<
      | "ready"
      | "fresh_absence"
      | "stale"
      | "budget_deferred"
      | "provider_unavailable"
      | "provider_failure"
    >();
  });
});
