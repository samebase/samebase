import { describe, expect, it } from "vite-plus/test";

import type { Id } from "./_generated/dataModel";
import {
  readRetryProvisioning,
  resolveWorkflowCompletionError,
} from "./repositoryProvisioningWorkflow";

function fakeUserId(value: string): Id<"users"> {
  // @ts-expect-error Convex ids are strings at runtime; the read never resolves it.
  return value;
}

describe("readRetryProvisioning", () => {
  it("reads a retry context saved before the provisioning field as samebase", () => {
    // The shape of a `read_retry_context` result that an in-flight retry workflow replays.
    const savedContext = { userId: fakeUserId("k57a3m9x2p8q4r6t1v0w5y7z3b8c2d4e") };

    expect(readRetryProvisioning(savedContext)).toEqual({ mode: "samebase" });
  });

  it("keeps the provisioning of a current retry context", () => {
    const provisioning = {
      mode: "repository_actions" as const,
      githubRepositoryDatabaseId: "9001",
    };

    expect(
      readRetryProvisioning({
        userId: fakeUserId("k57a3m9x2p8q4r6t1v0w5y7z3b8c2d4e"),
        provisioning,
      }),
    ).toBe(provisioning);
  });
});

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
