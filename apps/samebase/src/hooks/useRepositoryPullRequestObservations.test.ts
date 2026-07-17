import { describe, expect, it } from "vite-plus/test";

import { mapCloudflarePageObservation } from "./useRepositoryPullRequestObservations";
import type { PullRequestHeadIdentity } from "../../convex/repositoryObservations";

const head = {
  baseRepositoryNodeId: "R_base",
  pullRequestNodeId: "PR_1",
  headRepositoryNodeId: "R_base",
  headRefName: "feature",
  headCommitNodeId: "C_head",
  headOid: "head-sha",
} satisfies PullRequestHeadIdentity;

describe("mapCloudflarePageObservation", () => {
  it("distinguishes a request that has not started from loading", () => {
    expect(
      mapCloudflarePageObservation({
        batch: undefined,
        error: null,
        fetchStatus: "idle",
        heads: [head],
        now: 1_700_000_000_000,
      }),
    ).toEqual([["PR_1", { state: "not_requested" }]]);
    expect(
      mapCloudflarePageObservation({
        batch: undefined,
        error: null,
        fetchStatus: "fetching",
        heads: [head],
        now: 1_700_000_000_000,
      }),
    ).toEqual([["PR_1", { state: "loading" }]]);
  });

  it("labels expired absence stale while its refresh is running", () => {
    expect(
      mapCloudflarePageObservation({
        batch: {
          state: "observed",
          observedAt: 1_700_000_000_000,
          observations: [
            {
              state: "fresh_absence",
              head,
              observedAt: 1_700_000_000_000,
            },
          ],
        },
        error: null,
        fetchStatus: "fetching",
        heads: [head],
        now: 1_700_000_060_001,
      }),
    ).toEqual([
      [
        "PR_1",
        {
          state: "stale",
          head,
          observedAt: 1_700_000_000_000,
          lastKnown: { state: "fresh_absence" },
          refresh: { state: "loading" },
        },
      ],
    ]);
  });

  it("does not invent a provider failure before an expired result is re-requested", () => {
    expect(
      mapCloudflarePageObservation({
        batch: {
          state: "observed",
          observedAt: 1_700_000_000_000,
          observations: [
            {
              state: "fresh_absence",
              head,
              observedAt: 1_700_000_000_000,
            },
          ],
        },
        error: null,
        fetchStatus: "idle",
        heads: [head],
        now: 1_700_000_060_001,
      }),
    ).toMatchObject([
      [
        "PR_1",
        {
          state: "stale",
          refresh: { state: "not_requested" },
        },
      ],
    ]);
  });
});
