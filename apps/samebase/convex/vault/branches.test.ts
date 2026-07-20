import { describe, expect, it } from "vite-plus/test";

import {
  buildRemoteBranchSortFields,
  compareRemoteBranchSortOrder,
  countActiveRemoteBranches,
  hasBranchStagingChanges,
  resolveSyncedBranchLastCommitAt,
  resolveVaultDefaultBranch,
  selectDeletedUpstreamBranchesToAutoPrune,
} from "./branches";

describe("resolveVaultDefaultBranch", () => {
  it("uses the active provider default branch", () => {
    expect(
      resolveVaultDefaultBranch({
        defaultBranch: "main",
        remoteBranches: [
          { name: "main", isDefault: false, remoteState: "active" },
          { name: "trunk", isDefault: true, remoteState: "active" },
        ],
      }),
    ).toBe("trunk");
  });

  it("uses the vault default when no active catalog observation exists", () => {
    expect(
      resolveVaultDefaultBranch({
        defaultBranch: "master",
        remoteBranches: [{ name: "old-main", isDefault: true, remoteState: "deleted_upstream" }],
      }),
    ).toBe("master");
  });
});

describe("compareRemoteBranchSortOrder", () => {
  it("pins the repository default branch before deleted-upstream state", () => {
    expect(
      [
        {
          name: "feature/live",
          isDefault: false,
          remoteState: "active" as const,
        },
        {
          name: "main",
          isDefault: true,
          remoteState: "deleted_upstream" as const,
        },
      ].sort(compareRemoteBranchSortOrder),
    ).toEqual([
      {
        name: "main",
        isDefault: true,
        remoteState: "deleted_upstream",
      },
      {
        name: "feature/live",
        isDefault: false,
        remoteState: "active",
      },
    ]);
  });

  it("matches the indexable sort fields", () => {
    const branches = [
      {
        name: "feature/missing-commit",
        isDefault: false,
        remoteState: "active",
      },
      {
        name: "feature/newer-b",
        isDefault: false,
        remoteState: "active",
        lastCommitAt: 200,
      },
      {
        name: "main",
        isDefault: true,
        remoteState: "deleted_upstream",
      },
      {
        name: "feature/older",
        isDefault: false,
        remoteState: "active",
        lastCommitAt: 100,
      },
      {
        name: "feature/newer-a",
        isDefault: false,
        remoteState: "active",
        lastCommitAt: 200,
      },
      {
        name: "feature/deleted",
        isDefault: false,
        remoteState: "deleted_upstream",
        lastCommitAt: 300,
      },
    ] as const;

    const comparatorOrder = [...branches].sort(compareRemoteBranchSortOrder).map((branch) => {
      return branch.name;
    });
    const indexOrder = [...branches]
      .sort((left, right) => {
        const leftSortFields = buildRemoteBranchSortFields(left);
        const rightSortFields = buildRemoteBranchSortFields(right);
        return (
          leftSortFields.defaultRank - rightSortFields.defaultRank ||
          leftSortFields.stateRank - rightSortFields.stateRank ||
          leftSortFields.commitRank - rightSortFields.commitRank ||
          left.name.localeCompare(right.name)
        );
      })
      .map((branch) => {
        return branch.name;
      });

    expect(indexOrder).toEqual(comparatorOrder);
  });
});

describe("countActiveRemoteBranches", () => {
  it("counts only active remote branches for auto-refresh budgeting", () => {
    expect(
      countActiveRemoteBranches([
        { remoteState: "active" },
        { remoteState: "deleted_upstream" },
        { remoteState: "active" },
      ]),
    ).toBe(2);
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

  it("treats create-then-delete tombstones as clean", () => {
    expect(
      hasBranchStagingChanges({
        fileDeleted: true,
        parentCommitSha: null,
        filePath: "src/tmp.ts",
        initialFilePath: "src/tmp.ts",
        content: "temp",
        initialContent: "",
      }),
    ).toBe(false);
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
