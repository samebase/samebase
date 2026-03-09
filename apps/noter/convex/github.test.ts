import { describe, expect, it } from "vitest";

import {
  computeRepositoryTreeUpdatePlan,
  normalizeGitHubRepositoryListItem,
  resolveAheadBehindBaseBranch,
} from "./github";

describe("normalizeGitHubRepositoryListItem", () => {
  it("drops extra fields from GitHub repository payloads", () => {
    const normalized = normalizeGitHubRepositoryListItem({
      id: 1021726325,
      name: "noter",
      full_name: "nicu-chiciuc/noter",
      html_url: "https://github.com/nicu-chiciuc/noter",
      description: null,
      private: true,
      fork: false,
      created_at: "2025-07-17T21:10:37Z",
      updated_at: "2026-03-08T12:43:20Z",
      language: "TypeScript",
      stargazers_count: 0,
      forks_count: 0,
      allow_forking: true,
      owner: { login: "nicu-chiciuc" },
    });

    expect(normalized).toEqual({
      id: 1021726325,
      name: "noter",
      full_name: "nicu-chiciuc/noter",
      html_url: "https://github.com/nicu-chiciuc/noter",
      description: null,
      private: true,
      fork: false,
      created_at: "2025-07-17T21:10:37Z",
      updated_at: "2026-03-08T12:43:20Z",
      language: "TypeScript",
      stargazers_count: 0,
      forks_count: 0,
    });
  });
});

describe("computeRepositoryTreeUpdatePlan", () => {
  it("updates only branch cache for non-default branches", () => {
    const plan = computeRepositoryTreeUpdatePlan({
      resolvedBranch: "feature/multi-branch",
      defaultBranch: "main",
      fetchedTreeSHA: "tree-feature",
      fetchedCommitSHA: "commit-feature",
      cachedBranchTree: null,
      legacyTreeSHA: "tree-main",
      legacyCommitSHA: "commit-main",
    });

    expect(plan).toEqual({
      shouldUpdateBranchTree: true,
      shouldUpdateLegacyTree: false,
      shouldUpdateLegacyCommit: false,
    });
  });

  it("updates legacy cache when default branch changed", () => {
    const plan = computeRepositoryTreeUpdatePlan({
      resolvedBranch: "main",
      defaultBranch: "main",
      fetchedTreeSHA: "tree-main-new",
      fetchedCommitSHA: "commit-main-new",
      cachedBranchTree: {
        treeSHA: "tree-main-old",
        commitSHA: "commit-main-old",
      },
      legacyTreeSHA: "tree-main-old",
      legacyCommitSHA: "commit-main-old",
    });

    expect(plan).toEqual({
      shouldUpdateBranchTree: true,
      shouldUpdateLegacyTree: true,
      shouldUpdateLegacyCommit: true,
    });
  });

  it("keeps branch cache untouched but heals legacy default cache drift", () => {
    const plan = computeRepositoryTreeUpdatePlan({
      resolvedBranch: "main",
      defaultBranch: "main",
      fetchedTreeSHA: "tree-main",
      fetchedCommitSHA: "commit-main",
      cachedBranchTree: {
        treeSHA: "tree-main",
        commitSHA: "commit-main",
      },
      legacyTreeSHA: "tree-main-stale",
      legacyCommitSHA: "commit-main-stale",
    });

    expect(plan).toEqual({
      shouldUpdateBranchTree: false,
      shouldUpdateLegacyTree: true,
      shouldUpdateLegacyCommit: true,
    });
  });
});

describe("resolveAheadBehindBaseBranch", () => {
  it("uses repository default branch when it exists among remote branches", () => {
    expect(
      resolveAheadBehindBaseBranch({
        branchNames: ["feature/a", "main", "feature/b"],
        defaultBranch: "main",
      }),
    ).toBe("main");
  });

  it("returns undefined when default branch does not exist", () => {
    expect(
      resolveAheadBehindBaseBranch({
        branchNames: ["master", "feature/a"],
        defaultBranch: "trunk",
      }),
    ).toBeUndefined();
  });

  it("supports non-main default branches", () => {
    expect(
      resolveAheadBehindBaseBranch({
        branchNames: ["feature/a", "trunk", "feature/b"],
        defaultBranch: "trunk",
      }),
    ).toBe("trunk");
  });
});
