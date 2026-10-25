import { describe, expect, it } from "vite-plus/test";

import {
  STALE_BASE_VERSION_ERROR_CODE,
  buildStaleBaseVersionErrorMessage,
  isStaleBaseVersionError,
  readTaggedErrorCode,
} from "./stagingErrors";

describe("stagingErrors", () => {
  it("builds a tagged stale-base-version message", () => {
    expect(
      buildStaleBaseVersionErrorMessage({
        expectedVersion: 3,
        actualVersion: 4,
      }),
    ).toBe("[STALE_BASE_VERSION] pushContentUpdate failed: stale base version (expected 3, got 4)");
  });

  it("detects stale-base-version errors by stable tag", () => {
    const error = new Error(
      buildStaleBaseVersionErrorMessage({
        expectedVersion: 1,
        actualVersion: 2,
      }),
    );

    expect(readTaggedErrorCode(error)).toBe(STALE_BASE_VERSION_ERROR_CODE);
    expect(isStaleBaseVersionError(error)).toBe(true);
  });

  it("detects stale-base-version errors when Convex wraps the message", () => {
    const error = new Error(
      `[CONVEX M(collaborative:pushContentUpdate)] Uncaught Error: ${buildStaleBaseVersionErrorMessage(
        {
          expectedVersion: 2,
          actualVersion: 3,
        },
      )}`,
    );

    expect(readTaggedErrorCode(error)).toBe(STALE_BASE_VERSION_ERROR_CODE);
    expect(isStaleBaseVersionError(error)).toBe(true);
  });

  it("detects stale-base-version errors by error name", () => {
    const error = new Error("Version conflict");
    error.name = STALE_BASE_VERSION_ERROR_CODE;

    expect(readTaggedErrorCode(error)).toBe(STALE_BASE_VERSION_ERROR_CODE);
    expect(isStaleBaseVersionError(error)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isStaleBaseVersionError(new Error("other failure"))).toBe(false);
    expect(readTaggedErrorCode("nope")).toBeNull();
  });
});
