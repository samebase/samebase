import { describe, expect, it } from "vite-plus/test";

import { resolveWorkflowCompletionError } from "./appProvisioningWorkflow";

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

  it("uses a safe message for canceled workflows", () => {
    expect(
      resolveWorkflowCompletionError({
        kind: "canceled",
      }),
    ).toBe("Provisioning workflow was canceled.");
  });
});
