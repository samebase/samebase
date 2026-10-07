import { describe, expect, it } from "vite-plus/test";

import { findBestInitialFile } from "@/repository/editor/fileViewShared";

function blob(path: string) {
  return { path, mode: "100644", type: "blob", sha: `sha-${path}` };
}

describe("findBestInitialFile", () => {
  it("skips files that are deleted in staging", () => {
    const tree = [blob("README.md"), blob("docs/guide.md"), blob("src/index.ts")];

    expect(findBestInitialFile(tree, new Set(["README.md"]))).toBe("docs/guide.md");
    expect(findBestInitialFile(tree, new Set(["README.md", "docs/guide.md"]))).toBe("src/index.ts");
    expect(findBestInitialFile(tree, new Set(tree.map((file) => file.path)))).toBeNull();
  });
});
