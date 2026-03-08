import { describe, expect, it } from "vitest";

import {
  listTouchedBranchesForRefresh,
  selectBatchReadRepositoryTree,
} from "./fileStagingActions";

const featureTree = [
  {
    path: "src/feature.ts",
    mode: "100644",
    type: "blob",
    sha: "feature-sha",
  },
];

const defaultTree = [
  {
    path: "src/main.ts",
    mode: "100644",
    type: "blob",
    sha: "main-sha",
  },
];

describe("selectBatchReadRepositoryTree", () => {
  it("uses the branch tree when available", () => {
    expect(
      selectBatchReadRepositoryTree({
        requestedBranch: "feature/login",
        defaultBranch: "main",
        branchTree: featureTree,
        legacyTree: defaultTree,
      }),
    ).toEqual(featureTree);
  });

  it("allows legacy fallback only for default branch requests", () => {
    expect(
      selectBatchReadRepositoryTree({
        requestedBranch: "main",
        defaultBranch: "main",
        branchTree: null,
        legacyTree: defaultTree,
      }),
    ).toEqual(defaultTree);
  });

  it("throws when non-default branch cache is missing", () => {
    expect(() =>
      selectBatchReadRepositoryTree({
        requestedBranch: "feature/login",
        defaultBranch: "main",
        branchTree: null,
        legacyTree: defaultTree,
      }),
    ).toThrow('Branch tree is not cached for "feature/login"');
  });
});

describe("listTouchedBranchesForRefresh", () => {
  it("deduplicates branches while preserving first-seen order", () => {
    expect(
      listTouchedBranchesForRefresh([
        "main",
        "feature/a",
        "main",
        "feature/b",
        "feature/a",
      ]),
    ).toEqual(["main", "feature/a", "feature/b"]);
  });
});
