import { describe, expect, it } from "vite-plus/test";

import { resolveLegacyBranchlessFilePath } from "./legacyBranchlessRoute";

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
