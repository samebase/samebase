import { describe, expect, it } from "vitest";

import { getReviewSplitDiffHighlights } from "@/lib/reviewSplitDiff";

describe("getReviewSplitDiffHighlights", () => {
  it("highlights removed and added lines separately", () => {
    expect(
      getReviewSplitDiffHighlights("one\ntwo\nthree\n", "one\nbeta\nthree\n"),
    ).toEqual({
      oldLines: [2],
      newLines: [2],
    });
  });

  it("highlights added files on the new side only", () => {
    expect(getReviewSplitDiffHighlights("", "alpha\nbeta\n")).toEqual({
      oldLines: [],
      newLines: [1, 2],
    });
  });
});
