import { describe, expect, it } from "vitest";

import {
  buildStagingPreviewRefreshKey,
  getBranchComparePreviewReloadMode,
  getPreviewBaseFilePath,
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
  it("is stable regardless of input order", () => {
    const left = {
      _id: "file-1",
      version: 1,
      filePath: "src/a.ts",
      initialFilePath: "src/a.ts",
      fileDeleted: false,
      parentCommitSha: "abc123",
    };
    const right = {
      _id: "file-2",
      version: 1,
      filePath: "src/b.ts",
      initialFilePath: "src/b.ts",
      fileDeleted: false,
      parentCommitSha: "abc123",
    };

    expect(buildStagingPreviewRefreshKey([left, right])).toBe(
      buildStagingPreviewRefreshKey([right, left]),
    );
  });

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

  it("does not collide when paths or commit shas contain delimiters", () => {
    const keyA = buildStagingPreviewRefreshKey([
      {
        _id: "file-1",
        version: 1,
        filePath: "src/a:b.ts",
        initialFilePath: "src/c.ts",
        fileDeleted: false,
        parentCommitSha: "abc|123",
      },
    ]);
    const keyB = buildStagingPreviewRefreshKey([
      {
        _id: "file-1",
        version: 1,
        filePath: "src/a.ts",
        initialFilePath: "src/b:c.ts",
        fileDeleted: false,
        parentCommitSha: "abc:123",
      },
    ]);

    expect(keyA).not.toBe(keyB);
    expect(keyA).toBe(
      buildStagingPreviewRefreshKey([
        {
          _id: "file-1",
          version: 1,
          filePath: "src/a:b.ts",
          initialFilePath: "src/c.ts",
          fileDeleted: false,
          parentCommitSha: "abc|123",
        },
      ]),
    );
  });
});

describe("getPreviewBaseFilePath", () => {
  it("prefers the compare preview previous path when available", () => {
    expect(
      getPreviewBaseFilePath({
        comparedPreviousPath: "docs/guide.ts",
        currentFilePath: "docs/guide.md",
        previewPreviousPath: "docs/guide.txt",
        stagedCurrentFilePath: "docs/guide.md",
        stagedInitialFilePath: "docs/guide.js",
      }),
    ).toBe("docs/guide.ts");
  });

  it("falls back to the staged initial path for renamed staged files", () => {
    expect(
      getPreviewBaseFilePath({
        currentFilePath: "src/guide.md",
        stagedCurrentFilePath: "src/guide.md",
        stagedInitialFilePath: "src/guide.ts",
      }),
    ).toBe("src/guide.ts");
  });

  it("prefers the preview previous path over a stale staged row", () => {
    expect(
      getPreviewBaseFilePath({
        currentFilePath: "src/new-name.md",
        previewPreviousPath: "src/new-name.ts",
        stagedCurrentFilePath: "src/old-selection.md",
        stagedInitialFilePath: "src/old-selection.ts",
      }),
    ).toBe("src/new-name.ts");
  });

  it("uses the current path when no older path is recorded", () => {
    expect(
      getPreviewBaseFilePath({
        currentFilePath: "src/guide.ts",
        stagedCurrentFilePath: "src/guide.ts",
        stagedInitialFilePath: "src/guide.ts",
      }),
    ).toBe("src/guide.ts");
  });
});
