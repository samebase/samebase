import { describe, expect, it } from "vitest";
import { parseCommitPayload } from "./metadata";

describe("parseCommitPayload", () => {
  it("parses structured commit conflict details when present", () => {
    const payloadJson = JSON.stringify({
      type: "commit_proposal",
      message: "Apply staged changes",
      committed: false,
      committing: false,
      error: "Commit conflicts with upstream changes",
      conflicts: [
        {
          path: "src/app.ts",
          reason: "content_conflict",
        },
      ],
    });

    const parsed = parseCommitPayload(payloadJson);
    expect(parsed?.conflicts).toEqual([
      {
        path: "src/app.ts",
        reason: "content_conflict",
      },
    ]);
  });

  it("rejects commit payload when conflict reason is invalid", () => {
    const payloadJson = JSON.stringify({
      type: "commit_proposal",
      message: "Apply staged changes",
      conflicts: [
        {
          path: "src/app.ts",
          reason: "unknown_reason",
        },
      ],
    });

    expect(parseCommitPayload(payloadJson)).toBeNull();
  });
});
