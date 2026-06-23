import { describe, expect, it } from "vite-plus/test";

import {
  buildConvexDeploymentDashboardUrl,
  buildConvexPreviewDeploymentDashboardUrl,
  buildConvexProjectSettingsDashboardUrl,
} from "./dashboard";
import {
  compareRemoteBranchSortOrder,
  countActiveRemoteBranches,
  hasBranchStagingChanges,
  resolveSyncedBranchLastCommitAt,
  resolveSyncedCloudflarePreviewMetadata,
  resolveVaultBranchSelection,
  selectDeletedUpstreamBranchesToAutoPrune,
  shouldClearCloudflarePreviewForPullRequestSync,
} from "./branches";

describe("buildConvexDeploymentDashboardUrl", () => {
  it("targets the project-scoped production deployment dashboard", () => {
    expect(
      buildConvexDeploymentDashboardUrl({
        teamSlug: "nicu",
        projectSlug: "nicu-chiciuc-tmp-96e7-dashboard-links-85",
        deploymentName: "patient-alligator-875",
      }),
    ).toBe(
      "https://dashboard.convex.dev/t/nicu/nicu-chiciuc-tmp-96e7-dashboard-links-85/patient-alligator-875",
    );
  });

  it("hides the link until the real dashboard slugs are known", () => {
    expect(
      buildConvexDeploymentDashboardUrl({
        teamSlug: undefined,
        projectSlug: "nicu-chiciuc-tmp-96e7-dashboard-links-85",
        deploymentName: "patient-alligator-875",
      }),
    ).toBeUndefined();
  });
});

describe("buildConvexProjectSettingsDashboardUrl", () => {
  it("targets the project-scoped settings dashboard", () => {
    expect(
      buildConvexProjectSettingsDashboardUrl({
        teamSlug: "nicu",
        projectSlug: "nicu-chiciuc-tmp-96e7-dashboard-links-85",
      }),
    ).toBe("https://dashboard.convex.dev/t/nicu/nicu-chiciuc-tmp-96e7-dashboard-links-85/settings");
  });

  it("hides the link until the real project dashboard slugs are known", () => {
    expect(
      buildConvexProjectSettingsDashboardUrl({
        teamSlug: "nicu",
        projectSlug: undefined,
      }),
    ).toBeUndefined();
  });
});

describe("buildConvexPreviewDeploymentDashboardUrl", () => {
  it("targets the branch-scoped preview deployment dashboard", () => {
    expect(
      buildConvexPreviewDeploymentDashboardUrl({
        teamSlug: "nicu",
        projectSlug: "nicu-chiciuc-tmp-96e7-dashboard-links-85",
        branchName: "codex/dashboard-links",
      }),
    ).toBe(
      "https://dashboard.convex.dev/t/nicu/nicu-chiciuc-tmp-96e7-dashboard-links-85/preview/codex/dashboard-links",
    );
  });

  it("encodes branch path segments without collapsing branch slashes", () => {
    expect(
      buildConvexPreviewDeploymentDashboardUrl({
        teamSlug: "nicu",
        projectSlug: "noter",
        branchName: "feature/mobile links",
      }),
    ).toBe("https://dashboard.convex.dev/t/nicu/noter/preview/feature/mobile%20links");
  });

  it("hides the link until the real project dashboard slugs are known", () => {
    expect(
      buildConvexPreviewDeploymentDashboardUrl({
        teamSlug: "nicu",
        projectSlug: undefined,
        branchName: "codex/dashboard-links",
      }),
    ).toBeUndefined();
  });
});

describe("resolveVaultBranchSelection", () => {
  it("resolves to requested branch when it exists remotely", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/login",
        defaultBranch: "main",
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
        defaultBranch: "main",
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

  it("fails closed for requested non-default branches when remote branches are unavailable", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/login",
        defaultBranch: "main",
        remoteBranches: [],
      }),
    ).toEqual({
      defaultBranch: "main",
      resolvedBranch: "main",
      branchNotFound: true,
    });
  });

  it("keeps requested deleted-upstream branches when they are still tracked locally", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: "feature/local-work",
        defaultBranch: "main",
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

  it("uses the stored default branch when remote branches are unavailable", () => {
    expect(
      resolveVaultBranchSelection({
        requestedBranch: undefined,
        defaultBranch: "master",
        remoteBranches: [],
      }),
    ).toEqual({
      defaultBranch: "master",
      resolvedBranch: "master",
      branchNotFound: false,
    });
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
  it("replaces cached preview fields with the latest check-run snapshot", () => {
    expect(
      resolveSyncedCloudflarePreviewMetadata({
        incoming: {
          previewState: "resolved",
          cloudflarePreviewPullRequestNumber: 77,
          cloudflarePreviewCommitSha: "sha-new",
          cloudflarePreviewStatus: "⏳ Building",
        },
      }),
    ).toEqual({
      cloudflareBranchPreviewUrl: undefined,
      cloudflarePreviewPullRequestNumber: 77,
      cloudflarePreviewUrl: undefined,
      cloudflarePreviewCommitSha: "sha-new",
      cloudflarePreviewStatus: "⏳ Building",
      cloudflarePreviewLogsUrl: undefined,
      cloudflarePreviewCommentCreatedAt: undefined,
    });
  });

  it("clears cached preview fields when GitHub resolved to no compatible check run", () => {
    expect(
      resolveSyncedCloudflarePreviewMetadata({
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
        incomingHeadCommitSha: "sha-new",
        existingPullRequestNumber: 42,
        existingPreviewCommitSha: "sha-old",
      }),
    ).toBe(true);
  });

  it("clears the cached preview when the branch points to a different PR", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "resolved",
        incomingPullRequestNumber: 43,
        incomingHeadCommitSha: "sha-new",
        existingPullRequestNumber: 42,
        existingPreviewCommitSha: "sha-old",
      }),
    ).toBe(true);
  });

  it("clears the cached preview when the current PR head SHA changed", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "resolved",
        incomingPullRequestNumber: 42,
        incomingHeadCommitSha: "sha-new",
        existingPullRequestNumber: 42,
        existingPreviewCommitSha: "sha-old",
      }),
    ).toBe(true);
  });

  it("preserves the cached preview when the current PR number and head SHA are unchanged", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "resolved",
        incomingPullRequestNumber: 42,
        incomingHeadCommitSha: "sha-old",
        existingPullRequestNumber: 42,
        existingPreviewCommitSha: "sha-old",
      }),
    ).toBe(false);
  });

  it("preserves the cache when GitHub PR metadata could not be resolved", () => {
    expect(
      shouldClearCloudflarePreviewForPullRequestSync({
        incomingPullRequestState: "preserve",
        incomingPullRequestNumber: undefined,
        incomingHeadCommitSha: "sha-new",
        existingPullRequestNumber: 42,
        existingPreviewCommitSha: "sha-old",
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
