import { describe, expect, it } from "vitest";

import {
  buildStagingPreviewRefreshKey,
  getBranchComparePreviewReloadMode,
} from "@/lib/fileViewCompare";

describe("getBranchComparePreviewReloadMode", () => {
  it("reloads immediately when compare mode mounts for a target", () => {
    expect(
      getBranchComparePreviewReloadMode({
        previousTargetKey: null,
        previousStagingKey: null,
        nextTargetKey: "feature:no-pr:head-a",
        nextStagingKey: "",
      }),
    ).toBe("immediate");
  });

  it("reloads immediately when the compare target changes", () => {
    expect(
      getBranchComparePreviewReloadMode({
        previousTargetKey: "feature:no-pr:head-a",
        previousStagingKey: "staging-a",
        nextTargetKey: "feature:123:head-b",
        nextStagingKey: "staging-a",
      }),
    ).toBe("immediate");
  });

  it("debounces when only staging content changes", () => {
    expect(
      getBranchComparePreviewReloadMode({
        previousTargetKey: "feature:123:head-b",
        previousStagingKey: "staging-a",
        nextTargetKey: "feature:123:head-b",
        nextStagingKey: "staging-b",
      }),
    ).toBe("debounced");
  });

  it("does not reload when neither target nor staging changed", () => {
    expect(
      getBranchComparePreviewReloadMode({
        previousTargetKey: "feature:123:head-b",
        previousStagingKey: "staging-b",
        nextTargetKey: "feature:123:head-b",
        nextStagingKey: "staging-b",
      }),
    ).toBe("none");
  });
});

describe("buildStagingPreviewRefreshKey", () => {
  it("changes when the staged version changes", () => {
    expect(
      buildStagingPreviewRefreshKey([
        {
          _id: "file-1",
          version: 1,
          filePath: "src/app.ts",
          initialFilePath: "src/app.ts",
          fileDeleted: false,
          parentCommitSha: "abc123",
        },
      ]),
    ).not.toBe(
      buildStagingPreviewRefreshKey([
        {
          _id: "file-1",
          version: 2,
          filePath: "src/app.ts",
          initialFilePath: "src/app.ts",
          fileDeleted: false,
          parentCommitSha: "abc123",
        },
      ]),
    );
  });
});
