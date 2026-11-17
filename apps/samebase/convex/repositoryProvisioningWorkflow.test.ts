import { describe, expect, it } from "vite-plus/test";

import { resolveWorkflowCompletionError } from "./repositoryProvisioningWorkflow";

describe("resolveWorkflowCompletionError", () => {
  it("keeps successful workflow completion error-free", () => {
    expect(
      resolveWorkflowCompletionError({
        kind: "success",
        returnValue: null,
      }),
    ).toBeNull();
  });

  it("preserves failed workflow errors", () => {
    expect(
      resolveWorkflowCompletionError({
        kind: "failed",
        error: "Cloudflare setup failed.",
      }),
    ).toBe("Cloudflare setup failed.");
  });

  it("fails the run of a canceled workflow", () => {
    expect(
      resolveWorkflowCompletionError({
        kind: "canceled",
      }),
    ).not.toBeNull();
  });
});
