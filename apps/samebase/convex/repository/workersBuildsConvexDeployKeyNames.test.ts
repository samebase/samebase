import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { buildWorkersBuildsConvexDeployKeyNames } from "./workersBuildsConvexDeployKeyNames";

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this test exercises provider-visible names.
  return value;
}

function fakeWorkerId(value: string): Id<"repositoryCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this test exercises provider-visible names.
  return value;
}

describe("Workers Builds Convex deploy-key names", () => {
  it("keeps the exact versioned provider contract", () => {
    const repositoryId = fakeRepositoryId("repository-complete-identity");
    const workerId = fakeWorkerId("worker-complete-identity");

    expect(buildWorkersBuildsConvexDeployKeyNames({ repositoryId, workerId })).toEqual({
      production:
        "samebase-workers-builds-v2-repository-complete-identity-worker-complete-identity-production",
      preview:
        "samebase-workers-builds-v2-repository-complete-identity-worker-complete-identity-preview",
    });
  });

  it("does not collapse distinct full ids with the same suffix", () => {
    const first = buildWorkersBuildsConvexDeployKeyNames({
      repositoryId: fakeRepositoryId("first-repository-shared-suffix"),
      workerId: fakeWorkerId("first-worker-shared-suffix"),
    });
    const second = buildWorkersBuildsConvexDeployKeyNames({
      repositoryId: fakeRepositoryId("second-repository-shared-suffix"),
      workerId: fakeWorkerId("second-worker-shared-suffix"),
    });

    expect(first).not.toEqual(second);
  });
});
