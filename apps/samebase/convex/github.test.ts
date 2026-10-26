import { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vite-plus/test";

import {
  listGitHubRepositories,
  listGitHubRepositoryPreview,
  normalizeGitHubRepositoryListItem,
} from "./github";
import {
  isRepositoryMediaPreviewTooLarge,
  resolveStagedRepositoryMediaAsset,
} from "@samebase/git-editor/reads";

// Subset of GitHub's documented GET /installation/repositories response.
// https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation
function installationRepositoryFixture(args: { id: number; name: string; updatedAt: string }) {
  return {
    id: args.id,
    owner: { id: 285392744, login: "samebase" },
    name: args.name,
    full_name: `samebase/${args.name}`,
    html_url: `https://github.com/samebase/${args.name}`,
    description: null,
    private: true,
    fork: false,
    created_at: "2025-07-17T21:10:37Z",
    updated_at: args.updatedAt,
    language: "TypeScript",
    stargazers_count: 0,
    forks_count: 0,
  };
}

function createRepositoryListOctokit(repositories: unknown[]) {
  return new Octokit({
    request: {
      fetch: async () =>
        new Response(
          JSON.stringify({
            total_count: repositories.length,
            repositories,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    },
  });
}

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

describe("GitHub repository discovery order", () => {
  const repositories = [
    installationRepositoryFixture({
      id: 1,
      name: "older",
      updatedAt: "2026-03-10T00:00:00Z",
    }),
    installationRepositoryFixture({
      id: 2,
      name: "zeta",
      updatedAt: "2026-03-12T00:00:00Z",
    }),
    installationRepositoryFixture({
      id: 3,
      name: "alpha",
      updatedAt: "2026-03-12T00:00:00Z",
    }),
  ];

  it("orders the loaded preview by latest update with stable name ties", async () => {
    const result = await listGitHubRepositoryPreview({
      octokit: createRepositoryListOctokit(repositories),
    });

    expect(result.repositories.map((repository) => repository.full_name)).toEqual([
      "samebase/alpha",
      "samebase/zeta",
      "samebase/older",
    ]);
  });

  it("orders the complete repository set by latest update with stable name ties", async () => {
    const result = await listGitHubRepositories({
      octokit: createRepositoryListOctokit(repositories),
    });

    expect(result.map((repository) => repository.full_name)).toEqual([
      "samebase/alpha",
      "samebase/zeta",
      "samebase/older",
    ]);
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
