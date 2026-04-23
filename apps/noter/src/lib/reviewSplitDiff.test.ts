import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getReviewSplitDiffHighlights } from "./reviewSplitDiff";

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

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("diff");
  });

  it("does not overcount newline-terminated chunks when count is absent", async () => {
    vi.doMock("diff", () => ({
      diffLines: () => [
        { removed: true, value: "one\ntwo\n" },
        { added: true, value: "alpha\nbeta\n" },
      ],
    }));

    const { getReviewSplitDiffHighlights: getHighlightsWithoutCounts } =
      await import("./reviewSplitDiff");

    expect(getHighlightsWithoutCounts("ignored", "ignored")).toEqual({
      oldLines: [1, 2],
      newLines: [1, 2],
    });
  });
});
