import { describe, expect, it } from "vite-plus/test";

import {
  computeRepositoryTreeUpdatePlan,
  describeRepositoryTreeRefreshFailure,
  doesCachedBranchTreeSatisfyFileViewRefresh,
  isRepositoryMediaPreviewTooLarge,
  listGitHubRepositoryPreview,
  listGitHubRepositories,
  normalizeGitHubRepositoryListItem,
  readGitHubNextPageUrl,
  resolveStagedRepositoryMediaAsset,
} from "./github";

describe("doesCachedBranchTreeSatisfyFileViewRefresh", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");

  it("keeps the routine recent-success debounce", () => {
    expect(
      doesCachedBranchTreeSatisfyFileViewRefresh({
        cachedBranchTree: {
          commitSHA: "cached-head",
          lastTreeRefreshAt: now - 1_000,
        },
        request: { kind: "routine" },
        now,
      }),
    ).toBe(true);
    expect(
      doesCachedBranchTreeSatisfyFileViewRefresh({
        cachedBranchTree: {
          commitSHA: "cached-head",
          lastTreeRefreshAt: now - 120_000,
        },
        request: { kind: "routine" },
        now,
      }),
    ).toBe(false);
  });

  it("bypasses recent success only when inventory proves the cached commit is stale", () => {
    const cachedBranchTree = {
      commitSHA: "cached-head",
      lastTreeRefreshAt: now - 1_000,
    };

    expect(
      doesCachedBranchTreeSatisfyFileViewRefresh({
        cachedBranchTree,
        request: {
          kind: "inventory_mismatch",
          expectedHeadCommitSha: "published-head",
        },
        now,
      }),
    ).toBe(false);
    expect(
      doesCachedBranchTreeSatisfyFileViewRefresh({
        cachedBranchTree,
        request: {
          kind: "inventory_mismatch",
          expectedHeadCommitSha: "cached-head",
        },
        now,
      }),
    ).toBe(true);
  });
});

describe("normalizeGitHubRepositoryListItem", () => {
  it("drops extra fields from GitHub repository payloads", () => {
    const normalized = normalizeGitHubRepositoryListItem({
      id: 1021726325,
      name: "samebase",
      full_name: "samebase/samebase",
      html_url: "https://github.com/samebase/samebase",
      description: null,
      private: true,
      fork: false,
      created_at: "2025-07-17T21:10:37Z",
      updated_at: "2026-03-08T12:43:20Z",
      language: "TypeScript",
      stargazers_count: 0,
      forks_count: 0,
      allow_forking: true,
      owner: { login: "samebase" },
    });

    expect(normalized).toEqual({
      id: 1021726325,
      name: "samebase",
      full_name: "samebase/samebase",
      html_url: "https://github.com/samebase/samebase",
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
