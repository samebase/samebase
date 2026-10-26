import { describe, expect, it } from "vite-plus/test";

import { selectBatchReadRepositoryTree } from "@samebase/git-editor/operations";

const featureTree = [
  {
    path: "src/feature.ts",
    mode: "100644",
    type: "blob",
    sha: "feature-sha",
  },
];

describe("selectBatchReadRepositoryTree", () => {
  it("uses the branch tree when available", () => {
    expect(
      selectBatchReadRepositoryTree({
        requestedBranch: "feature/login",
        branchTree: featureTree,
      }),
    ).toEqual(featureTree);
  });

  it("uses the default branch tree when no branch is requested", () => {
    expect(
      selectBatchReadRepositoryTree({
        branchTree: featureTree,
      }),
    ).toEqual(featureTree);
  });

  it("throws when the requested branch cache is missing", () => {
    expect(() =>
      selectBatchReadRepositoryTree({
        requestedBranch: "feature/login",
        branchTree: null,
      }),
    ).toThrow('Branch tree is not cached for "feature/login"');
  });

  it("throws when no branch is requested before the default tree is cached", () => {
    expect(() =>
      selectBatchReadRepositoryTree({
        branchTree: null,
      }),
    ).toThrow("Default branch tree is not cached. Refresh and retry.");
  });
});
