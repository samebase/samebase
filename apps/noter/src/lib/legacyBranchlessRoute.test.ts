import { describe, expect, it } from "vitest";

import {
  resolveFilePathForResolvedBranch,
  resolveLegacyBranchlessFilePath,
} from "./legacyBranchlessRoute";

const tree = [
  { path: "docs.md", mode: "100644", type: "blob", sha: "1" },
  { path: "main/docs.md", mode: "100644", type: "blob", sha: "2" },
  { path: "src/app.ts", mode: "100644", type: "blob", sha: "3" },
];

describe("resolveLegacyBranchlessFilePath", () => {
  it("returns candidate when selected file is missing but branchless path exists", () => {
    expect(
      resolveLegacyBranchlessFilePath({
        branchSegment: "main",
        selectedFile: "docs.md",
        selectedFileExistsInTree: false,
        tree,
      }),
    ).toBe("main/docs.md");
  });

  it("does not rewrite when selected file already exists", () => {
    expect(
      resolveLegacyBranchlessFilePath({
        branchSegment: "main",
        selectedFile: "docs.md",
        selectedFileExistsInTree: true,
        tree,
      }),
    ).toBeNull();
  });

  it("does not rewrite when candidate file is missing", () => {
    expect(
      resolveLegacyBranchlessFilePath({
        branchSegment: "main",
        selectedFile: "missing.md",
        selectedFileExistsInTree: false,
        tree,
      }),
    ).toBeNull();
  });
});

describe("resolveFilePathForResolvedBranch", () => {
  it("preserves canonical file paths for normal bad-branch rewrites", () => {
    expect(
      resolveFilePathForResolvedBranch({
        selectedFile: "src/App.tsx",
        legacyBranchlessFilePath: null,
      }),
    ).toBe("src/App.tsx");
  });

  it("prefers recovered legacy branchless file paths when available", () => {
    expect(
      resolveFilePathForResolvedBranch({
        selectedFile: "docs.md",
        legacyBranchlessFilePath: "main/docs.md",
      }),
    ).toBe("main/docs.md");
  });

  it("returns undefined when the route points at the branch root", () => {
    expect(
      resolveFilePathForResolvedBranch({
        selectedFile: "",
        legacyBranchlessFilePath: null,
      }),
    ).toBeUndefined();
  });
});
