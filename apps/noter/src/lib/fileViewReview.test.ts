import { describe, expect, it } from "vitest";

import { shouldClearCompareOnReviewExit } from "@/lib/fileViewReview";

describe("shouldClearCompareOnReviewExit", () => {
  it("clears compare for compare-only review selections", () => {
    expect(
      shouldClearCompareOnReviewExit({
        isCompareRequested: true,
        hasComparedSelection: true,
        hasStagedSelection: false,
      }),
    ).toBe(true);
  });

  it("keeps compare when the reviewed file already has staging", () => {
    expect(
      shouldClearCompareOnReviewExit({
        isCompareRequested: true,
        hasComparedSelection: true,
        hasStagedSelection: true,
      }),
    ).toBe(false);
  });

  it("keeps compare off when compare mode is not active", () => {
    expect(
      shouldClearCompareOnReviewExit({
        isCompareRequested: false,
        hasComparedSelection: true,
        hasStagedSelection: false,
      }),
    ).toBe(false);
  });
});
