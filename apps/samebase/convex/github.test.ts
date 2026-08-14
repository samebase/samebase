import { describe, expect, it } from "vite-plus/test";

import {
  describeRepositoryTreeRefreshFailure,
  isRepositoryMediaPreviewTooLarge,
  normalizeGitHubRepositoryListItem,
  readExactRepositoryBranch,
  resolveStagedRepositoryMediaAsset,
} from "./github";

describe("readExactRepositoryBranch", () => {
  it("reads the immutable tree named by the observed branch generation", async () => {
    const requestedTreeShas: string[] = [];

    await expect(
      readExactRepositoryBranch({
        getBranch: async () => ({
          commitSha: "commit-2",
          treeSha: "tree-2",
        }),
        getTree: async (treeSha) => {
          requestedTreeShas.push(treeSha);
          return {
            sha: treeSha,
            truncated: false,
            tree: [],
          };
        },
        confirmRepository: async () => undefined,
      }),
    ).resolves.toEqual({
      kind: "ready",
      commitSha: "commit-2",
      treeData: {
        sha: "tree-2",
        truncated: false,
        tree: [],
      },
    });
    expect(requestedTreeShas).toEqual(["tree-2"]);
  });

  it("rejects an incomplete recursive tree instead of publishing it as ready", async () => {
    await expect(
      readExactRepositoryBranch({
        getBranch: async () => ({
          commitSha: "commit-2",
          treeSha: "tree-2",
        }),
        getTree: async () => ({
          sha: "tree-2",
          truncated: true,
          tree: [{ path: "partial.txt", mode: "100644", type: "blob", sha: "blob-1" }],
        }),
        confirmRepository: async () => undefined,
      }),
    ).resolves.toMatchObject({
      kind: "failed",
      error: expect.objectContaining({
        message: "GitHub returned an incomplete recursive repository tree.",
      }),
    });
  });

  it("confirms the repository before reporting an absent branch", async () => {
    let repositoryConfirmations = 0;

    await expect(
      readExactRepositoryBranch({
        getBranch: async () => {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        },
        getTree: async () => {
          throw new Error("Tree should not be read.");
        },
        confirmRepository: async () => {
          repositoryConfirmations += 1;
        },
      }),
    ).resolves.toEqual({ kind: "not_found" });
    expect(repositoryConfirmations).toBe(1);
  });

  it("keeps repository access failure distinct from branch absence", async () => {
    const repositoryError = Object.assign(new Error("Forbidden"), { status: 403 });

    await expect(
      readExactRepositoryBranch({
        getBranch: async () => {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        },
        getTree: async () => {
          throw new Error("Tree should not be read.");
        },
        confirmRepository: async () => {
          throw repositoryError;
        },
      }),
    ).resolves.toEqual({ kind: "unavailable", error: repositoryError });
  });

  it("keeps repository confirmation failures distinct from access loss", async () => {
    const repositoryError = Object.assign(new Error("Provider failed"), { status: 500 });

    await expect(
      readExactRepositoryBranch({
        getBranch: async () => {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        },
        getTree: async () => {
          throw new Error("Tree should not be read.");
        },
        confirmRepository: async () => {
          throw repositoryError;
        },
      }),
    ).resolves.toEqual({ kind: "failed", error: repositoryError });
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
      owner: { id: 285392744, login: "samebase" },
    });

    expect(normalized).toEqual({
      id: 1021726325,
      owner: { id: 285392744, login: "samebase" },
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

  it("rejects repository and owner IDs that are not positive safe integers", () => {
    const repository = {
      id: 1021726325,
      owner: { id: 285392744, login: "samebase" },
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
    };

    expect(normalizeGitHubRepositoryListItem({ ...repository, id: 0 })).toBeNull();
    expect(
      normalizeGitHubRepositoryListItem({
        ...repository,
        owner: { ...repository.owner, id: Number.MAX_SAFE_INTEGER + 1 },
      }),
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
