import { describe, expect, it } from "vite-plus/test";

import {
  shouldClearCompareOnReviewExit,
  shouldShowCompareBackToEditor,
} from "@/repository/editor/fileViewReview";

describe("shouldClearCompareOnReviewExit", () => {
  it("clears compare for compare-only review selections", () => {
    expect(
      shouldClearCompareOnReviewExit({
        isCompareRequested: true,
        hasComparedSelection: true,
        hasComparedEditorTarget: true,
        hasStagedSelection: false,
      }),
    ).toBe(true);
  });

  it("keeps compare for deleted compare-only review selections", () => {
    expect(
      shouldClearCompareOnReviewExit({
        isCompareRequested: true,
        hasComparedSelection: true,
        hasComparedEditorTarget: false,
        hasStagedSelection: false,
      }),
    ).toBe(false);
  });

  it("keeps compare when the reviewed file already has staging", () => {
    expect(
      shouldClearCompareOnReviewExit({
        isCompareRequested: true,
        hasComparedSelection: true,
        hasComparedEditorTarget: true,
        hasStagedSelection: true,
      }),
    ).toBe(false);
  });

  it("keeps compare off when compare mode is not active", () => {
    expect(
      shouldClearCompareOnReviewExit({
        isCompareRequested: false,
        hasComparedSelection: true,
        hasComparedEditorTarget: true,
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
        hasComparedEditorTarget: true,
        hasStagedSelection: false,
      }),
    ).toBe(true);
  });

  it("keeps the compare-only deleted diff in compare mode", () => {
    expect(
      shouldShowCompareBackToEditor({
        commitReviewMode: "editor",
        isCompareRequested: true,
        hasComparedEditorTarget: false,
        hasStagedSelection: false,
      }),
    ).toBe(false);
  });

  it("keeps review CTA when the selected file is staged", () => {
    expect(
      shouldShowCompareBackToEditor({
        commitReviewMode: "editor",
        isCompareRequested: true,
        hasComparedEditorTarget: true,
        hasStagedSelection: true,
      }),
    ).toBe(false);
  });

  it("does not show compare exit while already in review", () => {
    expect(
      shouldShowCompareBackToEditor({
        commitReviewMode: "review",
        isCompareRequested: true,
        hasComparedEditorTarget: true,
        hasStagedSelection: false,
      }),
    ).toBe(false);
  });
});
