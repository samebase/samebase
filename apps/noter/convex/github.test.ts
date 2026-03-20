import { describe, expect, it } from "vitest";

import {
  computeRepositoryTreeUpdatePlan,
  listGitHubRepositories,
  normalizeGitHubRepositoryListItem,
  readGitHubNextPageUrl,
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
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
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
