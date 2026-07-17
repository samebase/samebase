import { describe, expect, it } from "vite-plus/test";

import { buildCompleteCloudflareBuildObservation } from "./repositoryCloudflareBuilds";
import type { PullRequestHeadIdentity } from "./repositoryObservations";
import type { RepositoryObservationContext } from "./repositoryPullRequests";

const head = {
  baseRepositoryNodeId: "R_base",
  pullRequestNodeId: "PR_1",
  headRepositoryNodeId: "R_base",
  headRefName: "fixture-preview",
  headCommitNodeId: "C_head",
  headOid: "head-sha",
} satisfies PullRequestHeadIdentity;

function context(
  cloudflareWorkers: Extract<RepositoryObservationContext, { state: "ready" }>["cloudflareWorkers"],
): Extract<RepositoryObservationContext, { state: "ready" }> {
  return {
    state: "ready",
    owner: "samebase",
    name: "monorepo-fixture",
    repositoryDatabaseId: "42",
    cloudflareWorkers,
  };
}

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
  it("keeps every Worker build and attaches only exact connected roots", () => {
    const result = buildCompleteCloudflareBuildObservation({
      context: context([
        {
          workerName: "alpha",
          rootDirectory: { state: "known", value: "apps/alpha" },
        },
        {
          workerName: "beta",
          rootDirectory: { state: "known", value: "apps/beta" },
        },
      ]),
      head,
      observedAt: 1_700_000_000_000,
      checkRuns: [successfulCheckRun("beta", "v2"), successfulCheckRun("alpha", "v1")],
    });

    expect(result).toMatchObject({
      state: "ready",
      builds: {
        first: {
          workerName: "alpha",
          rootDirectory: { state: "known", value: "apps/alpha" },
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
            rootDirectory: { state: "known", value: "apps/beta" },
          },
        ],
      },
    });
  });

  it("does not guess a root when two connected Workers share a name", () => {
    const result = buildCompleteCloudflareBuildObservation({
      context: context([
        {
          workerName: "alpha",
          rootDirectory: { state: "known", value: "apps/one" },
        },
        {
          workerName: "alpha",
          rootDirectory: { state: "known", value: "apps/two" },
        },
      ]),
      head,
      observedAt: 1_700_000_000_000,
      checkRuns: [successfulCheckRun("alpha", "v1")],
    });

    expect(result).toMatchObject({
      state: "ready",
      builds: { first: { rootDirectory: { state: "unknown" } } },
    });
  });

  it("represents a complete empty result as current absence", () => {
    expect(
      buildCompleteCloudflareBuildObservation({
        context: context([]),
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
