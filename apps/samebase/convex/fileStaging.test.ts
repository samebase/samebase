import { describe, expect, it } from "vite-plus/test";
import { summarizeStagedFilesByBranch } from "@samebase/git-workspace/stagingChanges";
import { selectRepositoryTreeForBranch } from "./fileStaging";

const branchTree = [
  {
    path: "src/feature.ts",
    mode: "100644",
    type: "blob",
    sha: "feature-sha",
  },
];

describe("selectRepositoryTreeForBranch", () => {
  it("returns the branch-scoped tree when it exists", () => {
    expect(
      selectRepositoryTreeForBranch({
        requestedBranch: "feature/login",
        branchTree,
      }),
    ).toEqual(branchTree);
  });

  it("throws for missing branch trees", () => {
    expect(() =>
      selectRepositoryTreeForBranch({
        requestedBranch: "feature/login",
        branchTree: null,
      }),
    ).toThrow('Branch tree is not cached for "feature/login"');
  });

  it("throws for the default branch before its exact tree observation exists", () => {
    expect(() =>
      selectRepositoryTreeForBranch({
        requestedBranch: "main",
        branchTree: null,
      }),
    ).toThrow('Branch tree is not cached for "main"');
  });
});

describe("summarizeStagedFilesByBranch", () => {
  it("returns per-branch category counts for changed files only", () => {
    const summaries = summarizeStagedFilesByBranch([
      {
        branch: "feature/login",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/app.ts",
        initialFilePath: "src/app.ts",
        content: "new content",
        initialContent: "old content",
      },
      {
        branch: "feature/login",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/new-name.ts",
        initialFilePath: "src/old-name.ts",
        content: "same",
        initialContent: "same",
      },
      {
        branch: "feature/login",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/new-login.ts",
        initialFilePath: "src/old-login.ts",
        content: "updated",
        initialContent: "original",
      },
      {
        branch: "main",
        fileDeleted: true,
        parentCommitSha: "abc123",
        filePath: "README.md",
        initialFilePath: "README.md",
        content: "",
        initialContent: "# Readme",
      },
      {
        branch: "main",
        fileDeleted: false,
        parentCommitSha: null,
        filePath: "src/new.ts",
        initialFilePath: "src/new.ts",
        content: "hello",
        initialContent: "",
      },
      {
        branch: "main",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/unchanged.ts",
        initialFilePath: "src/unchanged.ts",
        content: "same",
        initialContent: "same",
      },
      {
        branch: "main",
        fileDeleted: true,
        parentCommitSha: null,
        filePath: "src/tmp.ts",
        initialFilePath: "src/tmp.ts",
        content: "temp",
        initialContent: "",
      },
    ]);

    expect(summaries).toEqual([
      {
        branch: "feature/login",
        counts: {
          modified: 1,
          deleted: 0,
          new: 0,
          renamed: 1,
          renamedAndModified: 1,
          total: 3,
        },
      },
      {
        branch: "main",
        counts: {
          modified: 0,
          deleted: 1,
          new: 1,
          renamed: 0,
          renamedAndModified: 0,
          total: 2,
        },
      },
    ]);
  });
});
