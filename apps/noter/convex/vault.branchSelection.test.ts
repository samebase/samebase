import { describe, expect, it } from "vite-plus/test";

import {
  countActiveRemoteBranches,
  hasBranchStagingChanges,
  resolveSyncedBranchLastCommitAt,
  resolveSyncedCloudflarePreviewMetadata,
  resolveVaultBranchSelection,
  selectDeletedUpstreamBranchesToAutoPrune,
  shouldClearCloudflarePreviewForPullRequestSync,
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

describe("resolveSyncedCloudflarePreviewMetadata", () => {
  it("preserves cached preview fields when the latest parsed comment is partial", () => {
    expect(
      resolveSyncedCloudflarePreviewMetadata({
        existing: {
          cloudflareBranchPreviewUrl: "https://branch.pages.dev/",
          cloudflarePreviewPullRequestNumber: 77,
          cloudflarePreviewUrl: "https://sha.pages.dev/",
          cloudflarePreviewCommitSha: "sha-old",
          cloudflarePreviewStatus: "✅ Deploy successful!",
          cloudflarePreviewLogsUrl: "https://dash.cloudflare.com/logs",
          cloudflarePreviewCommentCreatedAt: 123,
        },
        incoming: {
          previewState: "resolved",
          cloudflarePreviewPullRequestNumber: 77,
          cloudflarePreviewCommitSha: "sha-new",
          cloudflarePreviewStatus: "⏳ Building",
        },
      }),
    ).toEqual({
      cloudflareBranchPreviewUrl: "https://branch.pages.dev/",
      cloudflarePreviewPullRequestNumber: 77,
      cloudflarePreviewUrl: "https://sha.pages.dev/",
      cloudflarePreviewCommitSha: "sha-new",
      cloudflarePreviewStatus: "⏳ Building",
      cloudflarePreviewLogsUrl: "https://dash.cloudflare.com/logs",
      cloudflarePreviewCommentCreatedAt: 123,
    });
  });

  it("clears cached preview fields when GitHub resolved to no preview comment", () => {
    expect(
      resolveSyncedCloudflarePreviewMetadata({
        existing: {
          cloudflareBranchPreviewUrl: "https://branch.pages.dev/",
          cloudflarePreviewPullRequestNumber: 77,
          cloudflarePreviewUrl: "https://sha.pages.dev/",
          cloudflarePreviewCommitSha: "sha-old",
          cloudflarePreviewStatus: "✅ Deploy successful!",
          cloudflarePreviewLogsUrl: "https://dash.cloudflare.com/logs",
          cloudflarePreviewCommentCreatedAt: 123,
        },
        incoming: {
          previewState: "clear",
        },
      }),
    ).toEqual({
      cloudflareBranchPreviewUrl: undefined,
      cloudflarePreviewPullRequestNumber: undefined,
      cloudflarePreviewUrl: undefined,
      cloudflarePreviewCommitSha: undefined,
      cloudflarePreviewStatus: undefined,
      cloudflarePreviewLogsUrl: undefined,
      cloudflarePreviewCommentCreatedAt: undefined,
    });
  });
});

describe("shouldClearCloudflarePreviewForPullRequestSync", () => {
  it("clears the cached preview when the branch no longer has a current PR", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "resolved",
        incomingPullRequestNumber: undefined,
        existingPullRequestNumber: 42,
      }),
    ).toBe(true);
  });

  it("clears the cached preview when the branch points to a different PR", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "resolved",
        incomingPullRequestNumber: 43,
        existingPullRequestNumber: 42,
      }),
    ).toBe(true);
  });

  it("preserves the cached preview when the current PR number is unchanged", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "resolved",
        incomingPullRequestNumber: 42,
        existingPullRequestNumber: 42,
      }),
    ).toBe(false);
  });

  it("preserves the cache when GitHub PR metadata could not be resolved", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "preserve",
        incomingPullRequestNumber: undefined,
        existingPullRequestNumber: 42,
      }),
    ).toBe(false);
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
