import { describe, expect, it } from "vite-plus/test";

import {
  listTouchedBranchesForRefresh,
  runPostCommitTreeRefresh,
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

describe("listTouchedBranchesForRefresh", () => {
  it("deduplicates branches while preserving first-seen order", () => {
    expect(
      listTouchedBranchesForRefresh(["main", "feature/a", "main", "feature/b", "feature/a"]),
    ).toEqual(["main", "feature/a", "feature/b"]);
  });
});

describe("runPostCommitTreeRefresh", () => {
  it("returns updated vault when refresh succeeds", async () => {
    const calls: string[] = [];
    const result = await runPostCommitTreeRefresh({
      refreshBranchTree: async () => {
        calls.push("branch");
      },
      loadUpdatedVault: async () => {
        calls.push("load");
        return { treeSHA: "abc" };
      },
      onWarning: () => {
        throw new Error("Unexpected warning callback");
      },
    });

    expect(calls).toEqual(["branch", "load"]);
    expect(result).toEqual({ treeSHA: "abc" });
  });

  it("swallows refresh errors and returns null", async () => {
    const warnings: unknown[] = [];
    const result = await runPostCommitTreeRefresh({
      refreshBranchTree: async () => {
        throw new Error("network");
      },
      loadUpdatedVault: async () => ({ treeSHA: "abc" }),
      onWarning: (error) => {
        warnings.push(error);
      },
    });

    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBeInstanceOf(Error);
  });
});
