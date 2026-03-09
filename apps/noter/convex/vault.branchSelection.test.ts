import { describe, expect, it } from "vitest";

import {
  hasBranchStagingChanges,
  resolveSyncedBranchLastCommitAt,
  resolveVaultBranchSelection,
  selectDeletedUpstreamBranchesToAutoPrune,
} from "./vault";

describe("resolveVaultBranchSelection", () => {
  it("resolves to requested branch when it exists remotely", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/login",
        remoteBranches: [
          { name: "main", isDefault: true, remoteState: "active" },
          { name: "feature/login", isDefault: false, remoteState: "active" },
        ],
      }),
    ).toEqual({
      defaultBranch: "main",
      resolvedBranch: "feature/login",
      branchNotFound: false,
    });
  });

  it("flags missing requested branch and falls back to default branch", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "src",
        remoteBranches: [
          { name: "main", isDefault: true, remoteState: "active" },
          { name: "feature/login", isDefault: false, remoteState: "active" },
        ],
      }),
    ).toEqual({
      defaultBranch: "main",
      resolvedBranch: "main",
      branchNotFound: true,
    });
  });

  it("keeps requested branch when remote branches are unavailable", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/login",
        remoteBranches: [],
      }),
    ).toEqual({
      defaultBranch: undefined,
      resolvedBranch: "feature/login",
      branchNotFound: false,
    });
  });

  it("keeps requested deleted-upstream branches when they are still tracked locally", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/local-work",
        remoteBranches: [
          { name: "main", isDefault: true, remoteState: "active" },
          {
            name: "feature/local-work",
            isDefault: false,
            remoteState: "deleted_upstream",
          },
        ],
      }),
    ).toEqual({
      defaultBranch: "main",
      resolvedBranch: "feature/local-work",
      branchNotFound: false,
    });
  });

  it("falls back to main when nothing is specified", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: undefined,
        remoteBranches: [],
      }),
    ).toEqual({
      defaultBranch: undefined,
      resolvedBranch: "main",
      branchNotFound: false,
    });
  });
});

describe("resolveSyncedBranchLastCommitAt", () => {
  it("uses incoming timestamp when provided", () => {
    expect(
      resolveSyncedBranchLastCommitAt({
        incomingHeadCommitSha: "sha-new",
        incomingLastCommitAt: 123,
        existingBranch: {
          headCommitSha: "sha-old",
          lastCommitAt: 100,
        },
      }),
    ).toBe(123);
  });

  it("preserves previous timestamp when SHA is unchanged and incoming timestamp is missing", () => {
    expect(
      resolveSyncedBranchLastCommitAt({
        incomingHeadCommitSha: "sha-stable",
        incomingLastCommitAt: undefined,
        existingBranch: {
          headCommitSha: "sha-stable",
          lastCommitAt: 456,
        },
      }),
    ).toBe(456);
  });

  it("clears timestamp when SHA changed and incoming timestamp is missing", () => {
    expect(
      resolveSyncedBranchLastCommitAt({
        incomingHeadCommitSha: "sha-new",
        incomingLastCommitAt: undefined,
        existingBranch: {
          headCommitSha: "sha-old",
          lastCommitAt: 456,
        },
      }),
    ).toBeUndefined();
  });
});

describe("hasBranchStagingChanges", () => {
  it("treats unchanged staging records as clean", () => {
    expect(
      hasBranchStagingChanges({
        fileDeleted: false,
        parentCommitSha: "sha-1",
        filePath: "src/app.ts",
        initialFilePath: "src/app.ts",
        content: "same",
        initialContent: "same",
      }),
    ).toBe(false);
  });

  it("treats new files as uncommitted branch work", () => {
    expect(
      hasBranchStagingChanges({
        fileDeleted: false,
        parentCommitSha: null,
        filePath: "src/new.ts",
        initialFilePath: "src/new.ts",
        content: "",
        initialContent: "",
      }),
    ).toBe(true);
  });

  it("treats deleted files as uncommitted branch work", () => {
    expect(
      hasBranchStagingChanges({
        fileDeleted: true,
        parentCommitSha: "sha-1",
        filePath: "src/app.ts",
        initialFilePath: "src/app.ts",
        content: "same",
        initialContent: "same",
      }),
    ).toBe(true);
  });

  it("treats modified files as uncommitted branch work", () => {
    expect(
      hasBranchStagingChanges({
        fileDeleted: false,
        parentCommitSha: "sha-1",
        filePath: "src/app.ts",
        initialFilePath: "src/app.ts",
        content: "updated",
        initialContent: "same",
      }),
    ).toBe(true);
  });

  it("treats renamed files as uncommitted branch work", () => {
    expect(
      hasBranchStagingChanges({
        fileDeleted: false,
        parentCommitSha: "sha-1",
        filePath: "src/renamed.ts",
        initialFilePath: "src/app.ts",
        content: "same",
        initialContent: "same",
      }),
    ).toBe(true);
  });
});

describe("selectDeletedUpstreamBranchesToAutoPrune", () => {
  it("selects only deleted-upstream branches without staged changes", () => {
    expect(
      selectDeletedUpstreamBranchesToAutoPrune({
        branches: [
          { name: "main", remoteState: "active" },
          { name: "feature/merged", remoteState: "deleted_upstream" },
          { name: "feature/local-work", remoteState: "deleted_upstream" },
        ],
        branchHasStagedChanges: new Map([
          ["feature/merged", false],
          ["feature/local-work", true],
        ]),
      }),
    ).toEqual(["feature/merged"]);
  });
});
