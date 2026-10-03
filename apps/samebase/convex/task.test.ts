import { createAbortError, err, ok } from "@evolu/common";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { runTask } from "./task";

describe("request-scoped Tasks", () => {
  it.each([
    { label: "success", result: ok("accepted") },
    { label: "expected failure", result: err("rejected") },
  ])("returns $label unchanged after asynchronous cleanup", async ({ result }) => {
    let cleaned = false;
    const outcome = runTask((run) => {
      const child = run.create();
      child.defer(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        cleaned = true;
      });
      return result;
    });

    await expect(outcome).resolves.toBe(result);
    expect(cleaned).toBe(true);
  });

  it.each([
    { label: "server error", failure: new Error("Missing configuration") },
    { label: "application error", failure: new ConvexError("Not allowed") },
    { label: "cancellation", failure: createAbortError({ type: "Cancelled" }) },
    { label: "undefined defect", failure: undefined },
  ])("preserves the original $label after cleanup", async ({ failure }) => {
    let cleaned = false;
    await expect(
      runTask((run) => {
        const child = run.create();
        child.defer(() => {
          cleaned = true;
        });
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(cleaned).toBe(true);
  });

  it("fails when a root-owned child reports a cleanup defect after the task succeeds", async () => {
    const failure = new Error("Child cleanup failed");
    await expect(
      runTask((run) => {
        const child = run.create();
        child.defer(() => {
          throw failure;
        });
        return ok("accepted");
      }),
    ).rejects.toBe(failure);
  });

  it("retains both task and cleanup defects", async () => {
    const taskFailure = new Error("Task failed");
    const cleanupFailure = new Error("Cleanup failed");
    const outcome = runTask((run) => {
      const child = run.create();
      child.defer(() => {
        throw cleanupFailure;
      });
      throw taskFailure;
    });

    await expect(outcome).rejects.toBeInstanceOf(AggregateError);
    await expect(outcome).rejects.toMatchObject({ errors: [taskFailure, cleanupFailure] });
  });

  it("keeps concurrent invocations independent", async () => {
    const failure = new Error("First request failed");
    const success = ok("accepted");
    const failed = runTask(() => {
      throw failure;
    });
    const completed = runTask(() => success);

    await expect(failed).rejects.toBe(failure);
    await expect(completed).resolves.toBe(success);
  });
});
