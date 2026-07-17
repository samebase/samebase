import { describe, expect, it } from "vite-plus/test";

import {
  buildCloudflareHeadObservation,
  buildCompleteCloudflareBuildObservation,
} from "./repositoryCloudflareBuilds";
import type { PullRequestHeadIdentity } from "./repositoryObservations";

const head = {
  baseRepositoryNodeId: "R_base",
  pullRequestNodeId: "PR_1",
  headRepositoryNodeId: "R_base",
  headRefName: "fixture-preview",
  headCommitNodeId: "C_head",
  headOid: "head-sha",
} satisfies PullRequestHeadIdentity;

function successfulCheckRun(workerName: string, version: string) {
  return {
    checkRun: {
      id: `check-${workerName}`,
      name: `Workers Builds: ${workerName}`,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      branch: { state: "known" as const, name: "fixture-preview" },
      outputSummary: `Script: ${workerName}\nBuild ID: build-${workerName}\nPreview URL: https://${version}.${workerName}.workers.dev\nPreview Alias URL: https://fixture-preview.${workerName}.workers.dev`,
    },
  };
}

describe("buildCompleteCloudflareBuildObservation", () => {
  it("keeps every Worker build without guessing roots from stored Worker names", () => {
    const result = buildCompleteCloudflareBuildObservation({
      head,
      observedAt: 1_700_000_000_000,
      checkRuns: [successfulCheckRun("beta", "v2"), successfulCheckRun("alpha", "v1")],
    });

    expect(result).toMatchObject({
      state: "ready",
      builds: {
        first: {
          workerName: "alpha",
          rootDirectory: { state: "unknown" },
          preview: {
            state: "ready",
            versionUrl: "https://v1.alpha.workers.dev/",
            branchAlias: {
              state: "ready",
              branchName: "fixture-preview",
              url: "https://fixture-preview.alpha.workers.dev/",
            },
          },
        },
        rest: [
          {
            workerName: "beta",
            rootDirectory: { state: "unknown" },
          },
        ],
      },
    });
  });

  it("represents a complete empty result as current absence", () => {
    expect(
      buildCompleteCloudflareBuildObservation({
        head,
        observedAt: 1_700_000_000_000,
        checkRuns: [],
      }),
    ).toEqual({
      state: "fresh_absence",
      head,
      observedAt: 1_700_000_000_000,
    });
  });
});

describe("buildCloudflareHeadObservation", () => {
  it("treats a moved or closed pull request head as unavailable, not invalid provider data", () => {
    expect(
      buildCloudflareHeadObservation({
        observation: { state: "identity_mismatch", head },
        observedAt: 1_700_000_000_000,
      }),
    ).toEqual({
      state: "provider_unavailable",
      head,
      reason: "head_changed",
    });
  });

  it("keeps malformed provider data distinct from a changed head", () => {
    expect(
      buildCloudflareHeadObservation({
        observation: { state: "invalid_response", head },
        observedAt: 1_700_000_000_000,
      }),
    ).toEqual({
      state: "provider_failure",
      head,
      reason: "invalid_response",
    });
  });

  it("does not promise that repeating the same bounded pagination request will make progress", () => {
    expect(
      buildCloudflareHeadObservation({
        observation: {
          state: "incomplete",
          head,
          reason: "check_run_pagination",
        },
        observedAt: 1_700_000_000_000,
      }),
    ).toEqual({
      state: "provider_unavailable",
      head,
      reason: "pagination_guardrail",
    });
  });
});
