import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { buildWorkersBuildsConvexDeployKeyNames } from "./workersBuildsConvexDeployKeyNames";

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this test exercises provider-visible names.
  return value;
}

function fakeWorkerId(value: string): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this test exercises provider-visible names.
  return value;
}

describe("Workers Builds Convex deploy-key names", () => {
  it("keeps the exact versioned provider contract", () => {
    const vaultId = fakeVaultId("vault-complete-identity");
    const workerId = fakeWorkerId("worker-complete-identity");

    expect(buildWorkersBuildsConvexDeployKeyNames({ vaultId, workerId })).toEqual({
      production:
        "samebase-workers-builds-v2-vault-complete-identity-worker-complete-identity-production",
      preview:
        "samebase-workers-builds-v2-vault-complete-identity-worker-complete-identity-preview",
    });
  });

  it("does not collapse distinct full ids with the same suffix", () => {
    const first = buildWorkersBuildsConvexDeployKeyNames({
      vaultId: fakeVaultId("first-vault-shared-suffix"),
      workerId: fakeWorkerId("first-worker-shared-suffix"),
    });
    const second = buildWorkersBuildsConvexDeployKeyNames({
      vaultId: fakeVaultId("second-vault-shared-suffix"),
      workerId: fakeWorkerId("second-worker-shared-suffix"),
    });

    expect(first).not.toEqual(second);
  });
});
