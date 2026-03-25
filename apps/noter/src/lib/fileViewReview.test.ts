import { describe, expect, it } from "vitest";

import {
  shouldClearCompareOnReviewExit,
  shouldShowCompareBackToEditor,
} from "@/lib/fileViewReview";

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

describe("shouldShowCompareBackToEditor", () => {
  it("shows back to editor for compare-only editor mode", () => {
    expect(
      shouldShowCompareBackToEditor({
        commitReviewMode: "editor",
        isCompareRequested: true,
        hasChangesToCommit: false,
      }),
    ).toBe(true);
  });

  it("keeps review CTA when staged changes exist", () => {
    expect(
      shouldShowCompareBackToEditor({
        commitReviewMode: "editor",
        isCompareRequested: true,
        hasChangesToCommit: true,
      }),
    ).toBe(false);
  });

  it("does not show compare exit while already in review", () => {
    expect(
      shouldShowCompareBackToEditor({
        commitReviewMode: "review",
        isCompareRequested: true,
        hasChangesToCommit: false,
      }),
    ).toBe(false);
  });
});
