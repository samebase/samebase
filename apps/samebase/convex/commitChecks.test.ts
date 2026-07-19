import { describe, expect, it } from "vite-plus/test";

import {
  buildGitHubCommitCheckSummary,
  normalizeCommitCheckRun,
  normalizeCommitCheckSnapshot,
  normalizeCommitStatus,
  selectBranchPreviewAliasUrlFromCommitCheckItems,
} from "./commitChecks";

const SUCCESSFUL_WORKERS_SUMMARY = `Preview URL: https://fc4977af-noter-worker.nicuchiciuc.workers.dev
Preview Alias URL: https://codex-samebase-rebrand-rollout-plan-noter-worker.nicuchiciuc.workers.dev
Build ID: [5f9b6f2e-1e10-4062-988f-56b734c8c7a9](https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9)
Script: [noter-worker](https://dash.cloudflare.com/workers/services/view/noter-worker)
Version ID: d5b7c5f1-4ddf-4930-a398-3f26f6d00a19`;

const COMMIT_ONLY_WORKERS_SUMMARY = `Preview URL: https://fc4977af-noter-worker.nicuchiciuc.workers.dev
Build ID: [5f9b6f2e-1e10-4062-988f-56b734c8c7a9](https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9)
Script: [noter-worker](https://dash.cloudflare.com/workers/services/view/noter-worker)
Version ID: d5b7c5f1-4ddf-4930-a398-3f26f6d00a19`;

describe("normalizeCommitCheckRun", () => {
  it("stores Cloudflare Workers preview metadata on the normalized check item", () => {
    expect(
      normalizeCommitCheckRun({
        id: 154,
        name: "Workers Builds: noter-worker",
        status: "completed",
        conclusion: "success",
        appName: "Cloudflare Workers and Pages",
        appSlug: "cloudflare-workers-and-pages",
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
      detailsUrl: "https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9",
      githubUrl: "https://github.com/samebase/samebase/runs/154",
      previewUrl: "https://fc4977af-noter-worker.nicuchiciuc.workers.dev/",
      previewAliasUrl:
        "https://codex-samebase-rebrand-rollout-plan-noter-worker.nicuchiciuc.workers.dev/",
      previewStatus: "Build successful",
      logUrl: "https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9",
      startedAt: Date.parse("2026-06-23T10:00:00Z"),
      completedAt: Date.parse("2026-06-23T10:02:00Z"),
      updatedAt: Date.parse("2026-06-23T10:02:00Z"),
    });
  });

  it("keeps failed-build logs without inventing preview URLs", () => {
    expect(
      normalizeCommitCheckRun({
        id: 155,
        name: "Workers Builds: samebase",
        status: "completed",
        conclusion: "failure",
        appSlug: "cloudflare-workers-and-pages",
        detailsUrl: "https://dash.cloudflare.com/builds/failed-build",
        outputSummary: "Build ID: [failed-build](https://dash.cloudflare.com/builds/failed-build)",
        startedAt: "2026-06-23T10:00:00Z",
        completedAt: "2026-06-23T10:01:00Z",
      }),
    ).toMatchObject({
      source: "check_run",
      sourceKey: "155",
      state: "failure",
      previewUrl: undefined,
      previewAliasUrl: undefined,
      previewStatus: "Build failed",
      logUrl: "https://dash.cloudflare.com/builds/failed-build",
      updatedAt: Date.parse("2026-06-23T10:01:00Z"),
    });
  });

  it("rejects non-https preview and log URLs", () => {
    expect(
      normalizeCommitCheckRun({
        id: 156,
        name: "Workers Builds: samebase",
        status: "completed",
        conclusion: "success",
        appSlug: "cloudflare-workers-and-pages",
        detailsUrl: "http://dash.cloudflare.com/insecure",
        outputSummary: `Preview URL: javascript:alert(1)
Preview Alias URL: http://branch.example.com`,
        completedAt: "2026-06-23T10:02:00Z",
      }),
    ).toMatchObject({
      previewUrl: undefined,
      previewAliasUrl: undefined,
      previewStatus: "Build successful",
      logUrl: undefined,
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

describe("buildGitHubCommitCheckSummary", () => {
  it("summarizes check runs and commit statuses for the branch row", () => {
    const items = normalizeCommitCheckSnapshot({
      checkRuns: [
        {
          id: 1,
          name: "Workers Builds: samebase",
          status: "in_progress",
          appSlug: "cloudflare-workers-and-pages",
          detailsUrl: "https://dash.cloudflare.com/builds/running",
          outputSummary: SUCCESSFUL_WORKERS_SUMMARY,
        },
        {
          id: 2,
          name: "supply-chain",
          status: "completed",
          conclusion: "success",
          htmlUrl: "https://github.com/samebase/samebase/runs/2",
        },
      ],
      statuses: [
        {
          id: 3,
          state: "failure",
          context: "netlify/deploy-preview",
          targetUrl: "https://app.netlify.com/sites/example/deploys/3",
        },
      ],
    });

    expect(
      buildGitHubCommitCheckSummary({
        githubRepositoryId: "123",
        commitSha: "abc123",
        syncedAt: 1000,
        items,
      }),
    ).toEqual({
      githubRepositoryId: "123",
      commitSha: "abc123",
      state: "failure",
      totalCount: 3,
      checkRunCount: 2,
      statusContextCount: 1,
      successCount: 1,
      failureCount: 1,
      runningCount: 1,
      neutralCount: 0,
      unknownCount: 0,
      primaryTargetUrl: "https://app.netlify.com/sites/example/deploys/3",
      primaryLogUrl: "https://app.netlify.com/sites/example/deploys/3",
      syncedAt: 1000,
    });
  });

  it("selects branch preview aliases from normalized check items without adding them to summaries", () => {
    const items = normalizeCommitCheckSnapshot({
      checkRuns: [
        {
          id: 1,
          name: "Workers Builds: samebase",
          status: "completed",
          conclusion: "success",
          appSlug: "cloudflare-workers-and-pages",
          outputSummary: SUCCESSFUL_WORKERS_SUMMARY,
        },
      ],
      statuses: [],
    });

    expect(selectBranchPreviewAliasUrlFromCommitCheckItems(items)).toBe(
      "https://codex-samebase-rebrand-rollout-plan-noter-worker.nicuchiciuc.workers.dev/",
    );
  });

  it("does not promote commit preview URLs into branch preview aliases", () => {
    const items = normalizeCommitCheckSnapshot({
      checkRuns: [
        {
          id: 1,
          name: "Workers Builds: samebase",
          status: "completed",
          conclusion: "success",
          appSlug: "cloudflare-workers-and-pages",
          outputSummary: COMMIT_ONLY_WORKERS_SUMMARY,
        },
      ],
      statuses: [],
    });

    expect(items[0]?.previewUrl).toBe("https://fc4977af-noter-worker.nicuchiciuc.workers.dev/");
    expect(selectBranchPreviewAliasUrlFromCommitCheckItems(items)).toBeUndefined();
  });
});
