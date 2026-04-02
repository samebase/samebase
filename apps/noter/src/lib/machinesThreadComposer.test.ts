import { describe, expect, it } from "vitest";

import {
  DEFAULT_MACHINE_THREAD_MODEL,
  DEFAULT_MACHINE_THREAD_REASONING_EFFORT,
  planMachineTurnSubmission,
  readMachineThreadModel,
  readMachineThreadReasoningEffort,
} from "./machinesThreadComposer";

describe("readMachineThreadModel", () => {
  it("falls back to the default model for unknown query params", () => {
    expect(readMachineThreadModel("unknown-model")).toBe(
      DEFAULT_MACHINE_THREAD_MODEL,
    );
  });

  it("accepts supported model slugs from query params", () => {
    expect(readMachineThreadModel("gpt-5.3-codex")).toBe("gpt-5.3-codex");
  });
});

describe("readMachineThreadReasoningEffort", () => {
  it("falls back to the default reasoning effort for unknown query params", () => {
    expect(readMachineThreadReasoningEffort("ultra")).toBe(
      DEFAULT_MACHINE_THREAD_REASONING_EFFORT,
    );
  });

  it("accepts supported reasoning effort values from query params", () => {
    expect(readMachineThreadReasoningEffort("high")).toBe("high");
  });
});

describe("planMachineTurnSubmission", () => {
  it("keeps model and effort on existing-thread turns", () => {
    expect(
      planMachineTurnSubmission({
        model: "gpt-5.4",
        prompt: "  Continue this thread.  ",
        reasoningEffort: "xhigh",
        selectedThreadId: "thread_123",
      }),
    ).toEqual({
      kind: "existing-thread",
      threadId: "thread_123",
      turnStartBody: {
        effort: "xhigh",
        model: "gpt-5.4",
        text: "Continue this thread.",
        threadId: "thread_123",
      },
    });
  });

  it("splits fresh-thread sends into thread and turn requests", () => {
    expect(
      planMachineTurnSubmission({
        model: "gpt-5.4-mini",
        prompt: "Start a new thread",
        reasoningEffort: "medium",
        selectedThreadId: null,
      }),
    ).toEqual({
      kind: "new-thread",
      threadStartBody: {
        model: "gpt-5.4-mini",
      },
      turnStartBody: {
        effort: "medium",
        model: "gpt-5.4-mini",
        text: "Start a new thread",
      },
    });
  });

  it("rejects blank prompts", () => {
    expect(() =>
      planMachineTurnSubmission({
        model: "gpt-5.4",
        prompt: "   ",
        reasoningEffort: "xhigh",
        selectedThreadId: "thread_123",
      }),
    ).toThrow("Prompt is required.");
  });
});
