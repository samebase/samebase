import { describe, expect, it } from "vite-plus/test";

import {
  applyRepositoryTreeMetadataSyncBudget,
  computeRepositoryRefreshPlan,
  computeRepositoryTreeMetadataSyncPlan,
  collectLatestOpenPullRequestsByBranch,
  computeRepositoryTreeUpdatePlan,
  describeRepositoryTreeRefreshFailure,
  isRepositoryMediaPreviewTooLarge,
  listGitHubRepositoryPreview,
  listGitHubRepositories,
  normalizeGitHubRepositoryListItem,
  readGitHubNextPageUrl,
  readPullRequestLabels,
  resolveStagedRepositoryMediaAsset,
  resolveAheadBehindBaseBranch,
  shouldBypassRecentSuccessDebounceForBranchRefresh,
  shouldRefreshBranchTree,
  shouldRefreshRepositoryMetadata,
  shouldSyncCloudflarePreviewLinks,
} from "./github";

const repositoryMetadataSyncRequest = {
  includeAheadBehind: false,
  includePullRequestLinks: false,
  includeCloudflarePreviewLinks: false,
  cloudflarePreviewBranchNames: [],
  intent: "manual",
} satisfies Parameters<typeof computeRepositoryTreeMetadataSyncPlan>[0];

describe("normalizeGitHubRepositoryListItem", () => {
  it("drops extra fields from GitHub repository payloads", () => {
    const normalized = normalizeGitHubRepositoryListItem({
      id: 1021726325,
      name: "noter",
      full_name: "noter-md/noter",
      html_url: "https://github.com/noter-md/noter",
      description: null,
      private: true,
      fork: false,
      created_at: "2025-07-17T21:10:37Z",
      updated_at: "2026-03-08T12:43:20Z",
      language: "TypeScript",
      stargazers_count: 0,
      forks_count: 0,
      allow_forking: true,
      owner: { login: "noter-md" },
    });

    expect(normalized).toEqual({
      id: 1021726325,
      name: "noter",
      full_name: "noter-md/noter",
      html_url: "https://github.com/noter-md/noter",
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

describe("readGitHubNextPageUrl", () => {
  it("returns the next page URL from a GitHub Link header", () => {
    expect(
      readGitHubNextPageUrl(
        '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=4>; rel="last"',
      ),
    ).toBe("https://api.github.com/user/repos?page=2");
  });

  it("handles next-page URLs that contain commas in query params", () => {
    expect(
      readGitHubNextPageUrl(
        '<https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member&page=2>; rel="next", <https://api.github.com/user/repos?page=4>; rel="last"',
      ),
    ).toBe(
      "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member&page=2",
    );
  });

  it("returns null when there is no next page", () => {
    expect(
      readGitHubNextPageUrl(
        '<https://api.github.com/user/repos?page=1>; rel="prev", <https://api.github.com/user/repos?page=4>; rel="last"',
      ),
    ).toBeNull();
  });
});

describe("readPullRequestLabels", () => {
  it("returns ordered unique label metadata from GitHub PR payloads", () => {
    expect(
      readPullRequestLabels([
        { name: "bug", color: "d73a4a" },
        { name: "needs review", color: "fbca04" },
        { name: "bug", color: "000000" },
      ]),
    ).toEqual([
      { name: "bug", color: "d73a4a" },
      { name: "needs review", color: "fbca04" },
    ]);
  });

  it("ignores malformed labels and supports string payloads", () => {
    expect(readPullRequestLabels(["release", { name: "" }, { color: "ff0000" }, null, 42])).toEqual(
      [{ name: "release", color: undefined }],
    );
  });
});

describe("isRepositoryMediaPreviewTooLarge", () => {
  it("allows missing sizes and blobs at the preview limit", () => {
    expect(isRepositoryMediaPreviewTooLarge(undefined)).toBe(false);
    expect(isRepositoryMediaPreviewTooLarge(null)).toBe(false);
    expect(isRepositoryMediaPreviewTooLarge(1_000_000)).toBe(false);
  });

  it("rejects blobs above the preview limit", () => {
    expect(isRepositoryMediaPreviewTooLarge(1_000_001)).toBe(true);
  });
});

describe("shouldSyncCloudflarePreviewLinks", () => {
  it("requires both preview-link enrichment flags and resolved PR metadata", () => {
    expect(
      shouldSyncCloudflarePreviewLinks({
        includeCloudflarePreviewLinks: true,
        includePullRequestLinks: true,
        branches: [{ pullRequestState: "resolved" }, { pullRequestState: "resolved" }],
      }),
    ).toBe(true);
  });

  it("skips preview sync when PR discovery falls back to preserve", () => {
    expect(
      shouldSyncCloudflarePreviewLinks({
        includeCloudflarePreviewLinks: true,
        includePullRequestLinks: true,
        branches: [{ pullRequestState: "resolved" }, { pullRequestState: "preserve" }],
      }),
    ).toBe(false);
  });

  it("skips preview sync when no branches were targeted for hydration", () => {
    expect(
      shouldSyncCloudflarePreviewLinks({
        includeCloudflarePreviewLinks: true,
        includePullRequestLinks: true,
        branches: [],
      }),
    ).toBe(false);
  });
});

describe("describeRepositoryTreeRefreshFailure", () => {
  const now = Date.parse("2026-03-26T18:00:00Z");

  it("prioritizes retry-after over reset when GitHub provides both", () => {
    expect(
      describeRepositoryTreeRefreshFailure(
        {
          status: 403,
          message: "secondary rate limit",
          response: {
            headers: {
              "x-ratelimit-remaining": "0",
              "retry-after": "30",
              "x-ratelimit-reset": String(Math.floor((now + 90_000) / 1000)),
            },
          },
        },
        now,
      ),
    ).toEqual({
      kind: "rate_limited",
      message: "GitHub API rate limited. Auto-refresh paused.",
      cooldownUntil: now + 30_000,
    });
  });

  it("uses the primary reset window when retry-after is absent", () => {
    expect(
      describeRepositoryTreeRefreshFailure(
        {
          status: 403,
          message: "API rate limit exceeded",
          response: {
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": String(Math.floor((now + 90_000) / 1000)),
            },
          },
        },
        now,
      ),
    ).toEqual({
      kind: "rate_limited",
      message: "GitHub API rate limited. Auto-refresh paused.",
      cooldownUntil: now + 90_000,
    });
  });

  it("treats retry-after on 403 as a rate-limit backoff signal", () => {
    expect(
      describeRepositoryTreeRefreshFailure(
        {
          status: 403,
          message: "abuse detection mechanism",
          response: {
            headers: {
              "retry-after": "45",
            },
          },
        },
        now,
      ),
    ).toEqual({
      kind: "rate_limited",
      message: "GitHub API rate limited. Auto-refresh paused.",
      cooldownUntil: now + 45_000,
    });
  });

  it("uses a conservative fallback when only the error message indicates a rate limit", () => {
    expect(
      describeRepositoryTreeRefreshFailure(
        {
          status: 403,
          message: "secondary rate limit exceeded",
        },
        now,
      ),
    ).toEqual({
      kind: "rate_limited",
      message: "GitHub API rate limited. Auto-refresh paused.",
      cooldownUntil: now + 300_000,
    });
  });

  it("falls back to a generic failure cooldown", () => {
    expect(
      describeRepositoryTreeRefreshFailure(
        {
          status: 500,
          message: "boom",
        },
        now,
      ),
    ).toEqual({
      kind: "failed",
      message: "GitHub sync failed. Showing cached state.",
      cooldownUntil: now + 60_000,
    });
  });
});

describe("shouldBypassRecentSuccessDebounceForBranchRefresh", () => {
  it("bypasses debounce when branch metadata is stale", () => {
    expect(
      shouldBypassRecentSuccessDebounceForBranchRefresh({
        requestedBranch: "feature",
        defaultBranch: "main",
        branchNotFound: false,
        hasResolvedBranchTree: false,
      }),
    ).toBe(true);
  });

  it("only bypasses missing-branch refreshes when the missing branch was not confirmed recently", () => {
    const now = Date.parse("2026-03-26T18:00:00Z");

    expect(
      shouldBypassRecentSuccessDebounceForBranchRefresh({
        requestedBranch: "feature",
        defaultBranch: "main",
        branchNotFound: true,
        hasResolvedBranchTree: true,
        now,
        lastRepositoryMetadataRefreshAt: now - 31_000,
      }),
    ).toBe(true);
    expect(
      shouldBypassRecentSuccessDebounceForBranchRefresh({
        requestedBranch: "feature",
        defaultBranch: "main",
        branchNotFound: true,
        hasResolvedBranchTree: true,
        now,
        lastRepositoryMetadataRefreshAt: now - 5_000,
      }),
    ).toBe(false);
  });

  it("keeps default-branch refreshes on the repo debounce path", () => {
    expect(
      shouldBypassRecentSuccessDebounceForBranchRefresh({
        requestedBranch: "main",
        defaultBranch: "main",
        branchNotFound: false,
        hasResolvedBranchTree: false,
      }),
    ).toBe(false);
  });
});

describe("resolveStagedRepositoryMediaAsset", () => {
  it("falls back to the staged blob cache for binary media without a direct storage id", async () => {
    const getUrl = async (storageId: string) =>
      storageId === "storage-1" ? "https://cdn.example.test/cover.png" : null;

    const result = await resolveStagedRepositoryMediaAsset({
      storage: { getUrl },
      loadCachedBlobBySha: async (sha) =>
        sha === "blob-sha"
          ? {
              storageId: "storage-1",
              mime: "image/png",
            }
          : null,
      stagedFile: {
        fileDeleted: false,
        kind: "binary",
        content: "",
        stagedBlobSha: "blob-sha",
      },
      filePath: "assets/cover.png",
      mediaKind: "image",
      fileName: "cover.png",
    });

    expect(result).toEqual({
      found: true,
      kind: "image",
      mimeType: "image/png",
      url: "https://cdn.example.test/cover.png",
      fileName: "cover.png",
    });
  });

  it("reports staged binary previews as unavailable when no storage-backed blob can be resolved", async () => {
    const result = await resolveStagedRepositoryMediaAsset({
      storage: {
        getUrl: async () => null,
      },
      loadCachedBlobBySha: async () => null,
      stagedFile: {
        fileDeleted: false,
        kind: "binary",
        content: "",
        stagedBlobSha: "missing-sha",
      },
      filePath: "assets/cover.png",
      mediaKind: "image",
      fileName: "cover.png",
    });

    expect(result).toEqual({
      found: false,
      reason: "unavailable",
      message: "Staged upload is missing storage reference.",
    });
  });

  it("applies the preview size guard to directly staged binary uploads", async () => {
    const result = await resolveStagedRepositoryMediaAsset({
      storage: {
        getUrl: async () => {
          throw new Error("Should not fetch storage for oversized media");
        },
      },
      loadCachedBlobBySha: async () => null,
      stagedFile: {
        fileDeleted: false,
        kind: "binary",
        content: "",
        size: 1_000_001,
        storageId: "storage-1",
      },
      filePath: "assets/cover.png",
      mediaKind: "image",
      fileName: "cover.png",
    });

    expect(result).toEqual({
      found: false,
      reason: "unavailable",
      message: "Preview unavailable for files larger than 1 MB.",
    });
  });

  it("returns missing for deleted staged media", async () => {
    const result = await resolveStagedRepositoryMediaAsset({
      storage: {
        getUrl: async () => null,
      },
      loadCachedBlobBySha: async () => null,
      stagedFile: {
        fileDeleted: true,
        kind: "binary",
        content: "",
      },
      filePath: "assets/cover.png",
      mediaKind: "image",
      fileName: "cover.png",
    });

    expect(result).toEqual({
      found: false,
      reason: "missing",
    });
  });
});
describe("shouldRefreshRepositoryMetadata", () => {
  const now = Date.parse("2026-03-27T12:00:00Z");

  it("refreshes metadata on manual intent", () => {
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "manual",
        branchNotFound: false,
        includeCloudflarePreviewLinks: false,
        now,
      }),
    ).toBe(true);
  });

  it("keeps branch file views on the tree-only path while repo metadata is fresh", () => {
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "passive",
        requestedBranch: "feature/login",
        branchNotFound: false,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now - 5 * 60 * 1000,
        now,
      }),
    ).toBe(false);
  });

  it("keeps passive repository metadata stale-gated", () => {
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "passive",
        branchNotFound: false,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now - 5 * 60 * 1000,
        now,
      }),
    ).toBe(false);
  });

  it("refreshes repo-scoped source setup even when cached metadata is fresh", () => {
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "source_setup",
        branchNotFound: false,
        includeCloudflarePreviewLinks: true,
        lastRepositoryMetadataRefreshAt: now - 5 * 60 * 1000,
        now,
      }),
    ).toBe(true);
  });

  it("refreshes stale repo metadata from branch-scoped views", () => {
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "passive",
        requestedBranch: "feature/login",
        branchNotFound: false,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now - 11 * 60 * 1000,
        now,
      }),
    ).toBe(true);
  });

  it("refreshes stale dashboard metadata on passive activation", () => {
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "passive",
        branchNotFound: false,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now - 11 * 60 * 1000,
        now,
      }),
    ).toBe(true);
  });

  it("rechecks missing branches only after the missing-branch debounce expires", () => {
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "passive",
        requestedBranch: "feature/login",
        branchNotFound: true,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now - 31_000,
        now,
      }),
    ).toBe(true);
    expect(
      shouldRefreshRepositoryMetadata({
        intent: "passive",
        requestedBranch: "feature/login",
        branchNotFound: true,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now - 5_000,
        now,
      }),
    ).toBe(false);
  });
});

describe("computeRepositoryRefreshPlan", () => {
  const now = Date.parse("2026-03-27T12:00:00Z");

  it("re-enables branch tree refresh after metadata sync resolves a missing branch", () => {
    expect(
      computeRepositoryRefreshPlan({
        intent: "passive",
        requestedBranch: "feature/login",
        branchNotFound: true,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now - 11 * 60 * 1000,
        now,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      shouldRefreshTreeData: false,
    });

    expect(
      computeRepositoryRefreshPlan({
        intent: "passive",
        requestedBranch: "feature/login",
        branchNotFound: false,
        includeCloudflarePreviewLinks: false,
        lastRepositoryMetadataRefreshAt: now,
        now,
      }),
    ).toEqual({
      shouldSyncMetadata: false,
      shouldRefreshTreeData: true,
    });
  });
});

describe("computeRepositoryTreeMetadataSyncPlan", () => {
  it("skips repo metadata sync for branch-only refreshes by default", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        targetBranch: "feature/login",
      }),
    ).toEqual({
      shouldSyncMetadata: false,
      includeAheadBehind: false,
      includePullRequestLinks: false,
      includeCloudflarePreviewLinks: false,
      includeLastCommitTimestamps: false,
    });
  });

  it("keeps repo metadata sync for repo-scoped refreshes", () => {
    expect(computeRepositoryTreeMetadataSyncPlan(repositoryMetadataSyncRequest)).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: false,
      includePullRequestLinks: false,
      includeCloudflarePreviewLinks: false,
      includeLastCommitTimestamps: true,
    });
  });

  it("treats preview enrichment as an explicit metadata sync request", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        targetBranch: "feature/login",
        includeCloudflarePreviewLinks: true,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: false,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });

  it("keeps automatic large-repo refreshes on the cheap ahead/behind path without dropping branch ordering metadata", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        intent: "passive",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: false,
      includePullRequestLinks: false,
      includeCloudflarePreviewLinks: false,
      includeLastCommitTimestamps: true,
    });
  });

  it("treats the 40-branch boundary as still eligible for full enrichment", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks: true,
        intent: "passive",
        remoteBranchCount: 40,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: true,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });

  it("keeps manual refreshes fully enriched even for large repos", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        intent: "manual",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: true,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: false,
      includeLastCommitTimestamps: true,
    });
  });

  it("keeps source-setup preview hydration for large repos", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks: true,
        intent: "source_setup",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: true,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });

  it("skips preview-comment backfills during automatic large-repo refreshes while preserving commit timestamps", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        targetBranch: "feature/login",
        includeCloudflarePreviewLinks: true,
        intent: "passive",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: false,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: false,
      includeLastCommitTimestamps: true,
    });
  });

  it("keeps targeted preview-comment backfills during automatic large-repo refreshes", () => {
    expect(
      computeRepositoryTreeMetadataSyncPlan({
        ...repositoryMetadataSyncRequest,
        targetBranch: "feature/login",
        includeCloudflarePreviewLinks: true,
        cloudflarePreviewBranchNames: ["feature/login"],
        intent: "passive",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: false,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });
});

describe("applyRepositoryTreeMetadataSyncBudget", () => {
  it("caps the first automatic large-repo refresh once branch discovery knows the real size without dropping commit timestamps", () => {
    expect(
      applyRepositoryTreeMetadataSyncBudget({
        shouldSyncMetadata: true,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks: true,
        cloudflarePreviewBranchNames: [],
        includeLastCommitTimestamps: true,
        intent: "passive",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: false,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: false,
      includeLastCommitTimestamps: true,
    });
  });

  it("treats the 40-branch boundary as below the automatic budget cap", () => {
    expect(
      applyRepositoryTreeMetadataSyncBudget({
        shouldSyncMetadata: true,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks: true,
        cloudflarePreviewBranchNames: [],
        includeLastCommitTimestamps: true,
        intent: "passive",
        remoteBranchCount: 40,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: true,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });

  it("keeps manual large-repo refreshes fully enriched", () => {
    expect(
      applyRepositoryTreeMetadataSyncBudget({
        shouldSyncMetadata: true,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks: true,
        cloudflarePreviewBranchNames: [],
        includeLastCommitTimestamps: true,
        intent: "manual",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: true,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });

  it("keeps source-setup large-repo refreshes fully enriched", () => {
    expect(
      applyRepositoryTreeMetadataSyncBudget({
        shouldSyncMetadata: true,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks: true,
        cloudflarePreviewBranchNames: [],
        includeLastCommitTimestamps: true,
        intent: "source_setup",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: true,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });

  it("keeps targeted preview hydration enabled during automatic large-repo refreshes", () => {
    expect(
      applyRepositoryTreeMetadataSyncBudget({
        shouldSyncMetadata: true,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks: true,
        cloudflarePreviewBranchNames: ["feature/login"],
        includeLastCommitTimestamps: true,
        intent: "passive",
        remoteBranchCount: 75,
      }),
    ).toEqual({
      shouldSyncMetadata: true,
      includeAheadBehind: false,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: true,
      includeLastCommitTimestamps: true,
    });
  });
});

describe("shouldRefreshBranchTree", () => {
  it("refreshes branch views on passive activation", () => {
    expect(
      shouldRefreshBranchTree({
        intent: "passive",
        requestedBranch: "feature/login",
        branchNotFound: false,
      }),
    ).toBe(true);
  });

  it("skips default-branch dashboard refreshes on passive activation", () => {
    expect(
      shouldRefreshBranchTree({
        intent: "passive",
        branchNotFound: false,
      }),
    ).toBe(false);
  });

  it("refreshes the default branch tree after source setup", () => {
    expect(
      shouldRefreshBranchTree({
        intent: "source_setup",
        branchNotFound: false,
      }),
    ).toBe(true);
  });

  it("skips tree refresh entirely while the requested branch is still missing", () => {
    expect(
      shouldRefreshBranchTree({
        intent: "manual",
        requestedBranch: "feature/login",
        branchNotFound: true,
      }),
    ).toBe(false);
  });
});
describe("listGitHubRepositories", () => {
  it("iterates GitHub pagination and deduplicates by repository id", async () => {
    const requestedUrls: string[] = [];
    const responses = [
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: "alpha",
            full_name: "owner/alpha",
            html_url: "https://github.com/owner/alpha",
            description: null,
            private: true,
            fork: false,
            created_at: "2026-03-01T00:00:00Z",
            updated_at: "2026-03-10T00:00:00Z",
            language: "TypeScript",
            stargazers_count: 1,
            forks_count: 2,
            owner: { login: "owner" },
          },
          {
            id: 2,
            name: "beta",
            full_name: "owner/beta",
            html_url: "https://github.com/owner/beta",
            description: "first page",
            private: true,
            fork: false,
            created_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-11T00:00:00Z",
            language: "TypeScript",
            stargazers_count: 3,
            forks_count: 4,
          },
        ]),
        {
          headers: {
            Link: '<https://api.github.com/user/repos?page=2>; rel="next"',
          },
        },
      ),
      new Response(
        JSON.stringify([
          {
            id: 2,
            name: "beta",
            full_name: "owner/beta",
            html_url: "https://github.com/owner/beta",
            description: "second page",
            private: true,
            fork: false,
            created_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-12T00:00:00Z",
            language: "Rust",
            stargazers_count: 5,
            forks_count: 6,
          },
          {
            id: 3,
            name: "gamma",
            full_name: "org/gamma",
            html_url: "https://github.com/org/gamma",
            description: null,
            private: false,
            fork: false,
            created_at: "2026-03-03T00:00:00Z",
            updated_at: "2026-03-13T00:00:00Z",
            language: null,
            stargazers_count: 7,
            forks_count: 8,
          },
        ]),
      ),
    ];
    let responseIndex = 0;

    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrls.push(
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      );
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer github-token",
      });

      const response = responses[responseIndex];
      responseIndex += 1;
      return response;
    };

    const repositories = await listGitHubRepositories({
      accessToken: "github-token",
      fetchImpl,
    });

    expect(requestedUrls).toEqual([
      "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member",
      "https://api.github.com/user/repos?page=2",
    ]);
    expect(repositories).toEqual([
      {
        id: 1,
        name: "alpha",
        full_name: "owner/alpha",
        html_url: "https://github.com/owner/alpha",
        description: null,
        private: true,
        fork: false,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-10T00:00:00Z",
        language: "TypeScript",
        stargazers_count: 1,
        forks_count: 2,
      },
      {
        id: 2,
        name: "beta",
        full_name: "owner/beta",
        html_url: "https://github.com/owner/beta",
        description: "second page",
        private: true,
        fork: false,
        created_at: "2026-03-02T00:00:00Z",
        updated_at: "2026-03-12T00:00:00Z",
        language: "Rust",
        stargazers_count: 5,
        forks_count: 6,
      },
      {
        id: 3,
        name: "gamma",
        full_name: "org/gamma",
        html_url: "https://github.com/org/gamma",
        description: null,
        private: false,
        fork: false,
        created_at: "2026-03-03T00:00:00Z",
        updated_at: "2026-03-13T00:00:00Z",
        language: null,
        stargazers_count: 7,
        forks_count: 8,
      },
    ]);
  });

  it("fails closed on repeated next-page URLs", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify([]), {
        headers: {
          Link: '<https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member>; rel="next"',
        },
      });

    await expect(
      listGitHubRepositories({
        accessToken: "github-token",
        fetchImpl,
      }),
    ).rejects.toThrow("GitHub repository pagination loop detected");
  });
});

describe("listGitHubRepositoryPreview", () => {
  it("returns the first 10 updated repositories and marks hasMore from pagination", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrls.push(
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      );
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer github-token",
      });

      return new Response(
        JSON.stringify([
          {
            id: 1,
            name: "alpha",
            full_name: "owner/alpha",
            html_url: "https://github.com/owner/alpha",
            description: null,
            private: true,
            fork: false,
            created_at: "2026-03-01T00:00:00Z",
            updated_at: "2026-03-10T00:00:00Z",
            language: "TypeScript",
            stargazers_count: 1,
            forks_count: 2,
          },
        ]),
        {
          headers: {
            Link: '<https://api.github.com/user/repos?page=2>; rel="next"',
          },
        },
      );
    };

    const result = await listGitHubRepositoryPreview({
      accessToken: "github-token",
      fetchImpl,
    });

    expect(requestedUrls).toEqual([
      "https://api.github.com/user/repos?sort=updated&per_page=10&affiliation=owner,collaborator,organization_member",
    ]);
    expect(result).toEqual({
      repositories: [
        {
          id: 1,
          name: "alpha",
          full_name: "owner/alpha",
          html_url: "https://github.com/owner/alpha",
          description: null,
          private: true,
          fork: false,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-10T00:00:00Z",
          language: "TypeScript",
          stargazers_count: 1,
          forks_count: 2,
        },
      ],
      hasMore: true,
    });
  });

  it("reports hasMore false when the preview page is complete", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: "alpha",
            full_name: "owner/alpha",
            html_url: "https://github.com/owner/alpha",
            description: null,
            private: true,
            fork: false,
            created_at: "2026-03-01T00:00:00Z",
            updated_at: "2026-03-10T00:00:00Z",
            language: "TypeScript",
            stargazers_count: 1,
            forks_count: 2,
          },
        ]),
      );

    await expect(
      listGitHubRepositoryPreview({
        accessToken: "github-token",
        fetchImpl,
      }),
    ).resolves.toEqual({
      repositories: [
        {
          id: 1,
          name: "alpha",
          full_name: "owner/alpha",
          html_url: "https://github.com/owner/alpha",
          description: null,
          private: true,
          fork: false,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-10T00:00:00Z",
          language: "TypeScript",
          stargazers_count: 1,
          forks_count: 2,
        },
      ],
      hasMore: false,
    });
  });
});

describe("computeRepositoryTreeUpdatePlan", () => {
  it("updates only branch cache for non-default branches", () => {
    const plan = computeRepositoryTreeUpdatePlan({
      resolvedBranch: "feature/multi-branch",
      fetchedTreeSHA: "tree-feature",
      fetchedCommitSHA: "commit-feature",
      cachedBranchTree: null,
    });

    expect(plan).toEqual({
      shouldUpdateBranchTree: true,
    });
  });

  it("updates branch cache when the cached tree changed", () => {
    const plan = computeRepositoryTreeUpdatePlan({
      resolvedBranch: "main",
      fetchedTreeSHA: "tree-main-new",
      fetchedCommitSHA: "commit-main-new",
      cachedBranchTree: {
        treeSHA: "tree-main-old",
        commitSHA: "commit-main-old",
      },
    });

    expect(plan).toEqual({
      shouldUpdateBranchTree: true,
    });
  });

  it("keeps branch cache untouched when tree and commit match", () => {
    const plan = computeRepositoryTreeUpdatePlan({
      resolvedBranch: "main",
      fetchedTreeSHA: "tree-main",
      fetchedCommitSHA: "commit-main",
      cachedBranchTree: {
        treeSHA: "tree-main",
        commitSHA: "commit-main",
      },
    });

    expect(plan).toEqual({
      shouldUpdateBranchTree: false,
    });
  });
});

describe("collectLatestOpenPullRequestsByBranch", () => {
  it("keeps the latest same-repo pull request and preserves its title", () => {
    const pullRequestsByBranch = collectLatestOpenPullRequestsByBranch({
      branchNames: ["feature/pr-title"],
      repositoryFullName: "owner/noter",
      pullRequests: [
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "owner/noter",
            },
          },
          html_url: "https://github.com/owner/noter/pull/11",
          number: 11,
          title: "Older title",
          updated_at: "2026-03-20T10:00:00Z",
        },
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "fork/noter",
            },
          },
          html_url: "https://github.com/owner/noter/pull/12",
          number: 12,
          title: "Fork PR should be ignored",
          updated_at: "2026-03-21T10:00:00Z",
        },
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "owner/noter",
            },
          },
          html_url: "https://github.com/owner/noter/pull/13",
          number: 13,
          title: "Show PR title above branch name",
          updated_at: "2026-03-22T10:00:00Z",
        },
      ],
    });

    expect(pullRequestsByBranch.get("feature/pr-title")).toEqual({
      url: "https://github.com/owner/noter/pull/13",
      number: 13,
      labels: [],
      title: "Show PR title above branch name",
      isDraft: false,
    });
  });

  it("falls back to created_at when updated_at is missing", () => {
    const pullRequestsByBranch = collectLatestOpenPullRequestsByBranch({
      branchNames: ["feature/pr-title"],
      repositoryFullName: "owner/noter",
      pullRequests: [
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "owner/noter",
            },
          },
          html_url: "https://github.com/owner/noter/pull/21",
          number: 21,
          title: "Earlier PR",
          created_at: "2026-03-20T10:00:00Z",
        },
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "owner/noter",
            },
          },
          html_url: "https://github.com/owner/noter/pull/22",
          number: 22,
          title: "Later PR",
          created_at: "2026-03-21T10:00:00Z",
        },
      ],
    });

    expect(pullRequestsByBranch.get("feature/pr-title")).toEqual({
      url: "https://github.com/owner/noter/pull/22",
      number: 22,
      labels: [],
      title: "Later PR",
      isDraft: false,
    });
  });

  it("keeps the latest same-repo pull request even when it targets a non-default base branch", () => {
    const pullRequestsByBranch = collectLatestOpenPullRequestsByBranch({
      branchNames: ["feature/pr-title"],
      repositoryFullName: "owner/noter",
      pullRequests: [
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "owner/noter",
            },
          },
          base: {
            ref: "release/1.2",
          },
          html_url: "https://github.com/owner/noter/pull/21",
          number: 21,
          title: "Release PR",
          updated_at: "2026-03-23T10:00:00Z",
          labels: [{ name: "release", color: "1d76db" }],
        },
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "owner/noter",
            },
          },
          base: {
            ref: "main",
          },
          html_url: "https://github.com/owner/noter/pull/22",
          number: 22,
          title: "Default branch PR",
          updated_at: "2026-03-22T10:00:00Z",
          labels: [{ name: "needs review", color: "fbca04" }],
        },
      ],
    });

    expect(pullRequestsByBranch.get("feature/pr-title")).toEqual({
      url: "https://github.com/owner/noter/pull/21",
      number: 21,
      labels: [{ name: "release", color: "1d76db" }],
      title: "Release PR",
      isDraft: false,
    });
  });

  it("preserves draft state for the latest same-repo pull request", () => {
    const pullRequestsByBranch = collectLatestOpenPullRequestsByBranch({
      branchNames: ["feature/pr-title"],
      repositoryFullName: "owner/noter",
      pullRequests: [
        {
          head: {
            ref: "feature/pr-title",
            repo: {
              full_name: "owner/noter",
            },
          },
          html_url: "https://github.com/owner/noter/pull/21",
          number: 21,
          title: "Draft PR",
          updated_at: "2026-03-23T10:00:00Z",
          draft: true,
        },
      ],
    });

    expect(pullRequestsByBranch.get("feature/pr-title")).toEqual({
      url: "https://github.com/owner/noter/pull/21",
      number: 21,
      labels: [],
      title: "Draft PR",
      isDraft: true,
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
