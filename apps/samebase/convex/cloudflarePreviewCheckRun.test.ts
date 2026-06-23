import { describe, expect, it } from "vite-plus/test";

import {
  parseCloudflarePreviewCheckRun,
  selectCloudflarePreviewCheckRunMetadata,
} from "./cloudflarePreviewCheckRun";

const SUCCESSFUL_WORKERS_SUMMARY = `Preview URL: https://fc4977af-noter-worker.nicuchiciuc.workers.dev
Preview Alias URL: https://codex-samebase-rebrand-rollout-plan-noter-worker.nicuchiciuc.workers.dev
Build ID: [5f9b6f2e-1e10-4062-988f-56b734c8c7a9](https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9)
Script: [noter-worker](https://dash.cloudflare.com/workers/services/view/noter-worker)
Version ID: d5b7c5f1-4ddf-4930-a398-3f26f6d00a19`;

describe("parseCloudflarePreviewCheckRun", () => {
  it("extracts preview metadata from Cloudflare Workers check-run output", () => {
    expect(
      parseCloudflarePreviewCheckRun({
        id: 154,
        name: "Workers Builds: noter-worker",
        status: "completed",
        conclusion: "success",
        appSlug: "cloudflare-workers-and-pages",
        detailsUrl: "https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9",
        htmlUrl: "https://github.com/samebase/samebase/runs/154",
        outputSummary: SUCCESSFUL_WORKERS_SUMMARY,
        startedAt: "2026-06-23T10:00:00Z",
        completedAt: "2026-06-23T10:02:00Z",
      }),
    ).toEqual({
      branchPreviewUrl:
        "https://codex-samebase-rebrand-rollout-plan-noter-worker.nicuchiciuc.workers.dev/",
      previewUrl: "https://fc4977af-noter-worker.nicuchiciuc.workers.dev/",
      previewStatus: "Build successful",
      previewLogsUrl: "https://dash.cloudflare.com/builds/5f9b6f2e-1e10-4062-988f-56b734c8c7a9",
      previewUpdatedAt: Date.parse("2026-06-23T10:02:00Z"),
    });
  });

  it("keeps failed-build logs without inventing preview URLs", () => {
    expect(
      parseCloudflarePreviewCheckRun({
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
    ).toEqual({
      branchPreviewUrl: undefined,
      previewUrl: undefined,
      previewStatus: "Build failed",
      previewLogsUrl: "https://dash.cloudflare.com/builds/failed-build",
      previewUpdatedAt: Date.parse("2026-06-23T10:01:00Z"),
    });
  });

  it("rejects non-https preview and log URLs", () => {
    expect(
      parseCloudflarePreviewCheckRun({
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
    ).toEqual({
      branchPreviewUrl: undefined,
      previewUrl: undefined,
      previewStatus: "Build successful",
      previewLogsUrl: undefined,
      previewUpdatedAt: Date.parse("2026-06-23T10:02:00Z"),
    });
  });

  it("ignores checks from other providers", () => {
    expect(
      parseCloudflarePreviewCheckRun({
        id: 157,
        name: "CodeRabbit",
        status: "completed",
        conclusion: "success",
        appSlug: "coderabbitai",
        detailsUrl: "https://example.com/status",
        outputSummary: SUCCESSFUL_WORKERS_SUMMARY,
      }),
    ).toBeNull();
  });
});

describe("selectCloudflarePreviewCheckRunMetadata", () => {
  it("prefers the newest Cloudflare check run for the PR head", () => {
    expect(
      selectCloudflarePreviewCheckRunMetadata([
        {
          id: 1,
          name: "Workers Builds: samebase",
          status: "completed",
          conclusion: "success",
          appSlug: "cloudflare-workers-and-pages",
          detailsUrl: "https://dash.cloudflare.com/builds/success",
          outputSummary: SUCCESSFUL_WORKERS_SUMMARY,
          completedAt: "2026-06-23T10:00:00Z",
        },
        {
          id: 2,
          name: "Workers Builds: samebase",
          status: "completed",
          conclusion: "failure",
          appSlug: "cloudflare-workers-and-pages",
          detailsUrl: "https://dash.cloudflare.com/builds/failure",
          outputSummary: "",
          completedAt: "2026-06-23T11:00:00Z",
        },
      ]),
    ).toEqual({
      branchPreviewUrl: undefined,
      previewUrl: undefined,
      previewStatus: "Build failed",
      previewLogsUrl: "https://dash.cloudflare.com/builds/failure",
      previewUpdatedAt: Date.parse("2026-06-23T11:00:00Z"),
    });
  });
});
