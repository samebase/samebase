import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const octokitMocks = vi.hoisted(() => ({
  request: vi.fn(),
  getRef: vi.fn(),
  getCommit: vi.fn(),
  getTree: vi.fn(),
  getBlob: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly request = octokitMocks.request;
    readonly rest = {
      git: {
        getRef: octokitMocks.getRef,
        getCommit: octokitMocks.getCommit,
        getTree: octokitMocks.getTree,
        getBlob: octokitMocks.getBlob,
      },
    };
  },
}));

import { Octokit } from "@octokit/rest";
import type { GitHubVaultAccess } from "./githubAppAccess";
import {
  fetchGitHubConvexCodeLocationDiscovery,
  fetchGitHubDefaultBranchHead,
  listGitHubInstallationRepositories,
  resolveGitHubInstallationRepositoryIdentity,
} from "./githubRepoApi";

const octokit = new Octokit();

// Subset of GitHub's official GET /installation/repositories response example.
// https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation
const officialRepositoryIdentity = {
  id: 1_296_269,
  name: "Hello-World",
  full_name: "octocat/Hello-World",
  default_branch: "master",
  owner: {
    id: 1,
    login: "octocat",
  },
};
const repositoryTarget = {
  expectedRepoId: "1296269",
  expectedOwnerId: "1",
};

// @ts-expect-error Tests supply provider fixtures without the resolver-only capability marker.
const githubAccess: GitHubVaultAccess = {
  octokit,
  ghRepoId: repositoryTarget.expectedRepoId,
  githubOwnerId: repositoryTarget.expectedOwnerId,
  githubOwnerLogin: "octocat",
  repositoryName: "Hello-World",
  repositoryDefaultBranch: "master",
};

describe("GitHub repository API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: "commit-sha" } } });
    octokitMocks.getCommit.mockResolvedValue({ data: { tree: { sha: "tree-sha" } } });
  });

  it("lists the stable IDs that the installation can access", async () => {
    const signal = new AbortController().signal;
    // Subset of GitHub's official GET /installation/repositories response example.
    // https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation
    const secondRepository = {
      ...officialRepositoryIdentity,
      id: 2_345_678,
      name: "Second-World",
      full_name: "octocat/Second-World",
    };
    octokitMocks.request.mockResolvedValue({
      data: {
        total_count: 2,
        repositories: [officialRepositoryIdentity, secondRepository],
      },
    });

    await expect(listGitHubInstallationRepositories({ octokit, signal })).resolves.toEqual(
      new Map([
        [
          "1296269",
          {
            repositoryId: "1296269",
            ownerId: "1",
            ownerLogin: "octocat",
            repositoryName: "Hello-World",
            defaultBranch: "master",
          },
        ],
        [
          "2345678",
          {
            repositoryId: "2345678",
            ownerId: "1",
            ownerLogin: "octocat",
            repositoryName: "Second-World",
            defaultBranch: "master",
          },
        ],
      ]),
    );
    expect(octokitMocks.request).toHaveBeenCalledWith("GET /installation/repositories", {
      page: 1,
      per_page: 100,
      request: { signal },
    });
  });

  it("continues installation repository identity lookup on later pages", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...officialRepositoryIdentity,
      id: index + 1,
      name: `repository-${index + 1}`,
      full_name: `octocat/repository-${index + 1}`,
    }));
    const lastRepository = {
      ...officialRepositoryIdentity,
      id: 101,
      name: "renamed-repository",
      full_name: "renamed-owner/renamed-repository",
      owner: { id: 1, login: "renamed-owner" },
    };
    octokitMocks.request
      .mockResolvedValueOnce({
        data: { total_count: 101, repositories: firstPage },
      })
      .mockResolvedValueOnce({
        data: { total_count: 101, repositories: [lastRepository] },
      });

    const repositories = await listGitHubInstallationRepositories({ octokit });

    expect(repositories.size).toBe(101);
    expect(repositories.get("101")).toMatchObject({
      ownerLogin: "renamed-owner",
      repositoryName: "renamed-repository",
    });
    expect(octokitMocks.request).toHaveBeenNthCalledWith(2, "GET /installation/repositories", {
      page: 2,
      per_page: 100,
      request: { signal: expect.any(AbortSignal) },
    });
  });

  it("resolves current repository coordinates by stable ID", async () => {
    const signal = new AbortController().signal;
    const renamedRepository = {
      ...officialRepositoryIdentity,
      name: "Renamed-World",
      full_name: "renamed-owner/Renamed-World",
      owner: { id: 1, login: "renamed-owner" },
    };
    octokitMocks.request.mockResolvedValue({
      data: { total_count: 1, repositories: [renamedRepository] },
    });

    await expect(
      resolveGitHubInstallationRepositoryIdentity({
        octokit,
        ...repositoryTarget,
        signal,
      }),
    ).resolves.toEqual({
      ownerId: "1",
      ownerLogin: "renamed-owner",
      repositoryId: "1296269",
      repositoryName: "Renamed-World",
      defaultBranch: "master",
    });
    expect(octokitMocks.request).toHaveBeenCalledWith("GET /installation/repositories", {
      page: 1,
      per_page: 100,
      request: { signal },
    });
  });

  it("records and reads the current default-branch commit before a manual build", async () => {
    const signal = new AbortController().signal;
    const calls: unknown[] = [];
    octokitMocks.getRef.mockResolvedValue({
      data: { object: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
    });

    await expect(
      fetchGitHubDefaultBranchHead({
        githubAccess,
        signal,
        recordApiCall: async (call) => {
          calls.push(call);
        },
      }),
    ).resolves.toEqual({
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(octokitMocks.getRef).toHaveBeenCalledWith({
      owner: "octocat",
      repo: "Hello-World",
      ref: "heads/master",
      request: { signal },
    });
    expect(calls).toEqual([
      expect.objectContaining({ endpoint: "/repos/{owner}/{repo}/git/ref/{ref}" }),
    ]);
  });

  it("rejects a default-branch ref that is not a full commit SHA", async () => {
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: "short-sha" } } });

    await expect(
      fetchGitHubDefaultBranchHead({
        githubAccess,
      }),
    ).rejects.toThrow("GitHub default branch ref did not include a valid commit SHA.");
  });

  it("discovers exact regular convex.json blobs from default-branch tree metadata", async () => {
    octokitMocks.getTree.mockResolvedValue({
      data: {
        truncated: true,
        tree: [
          { type: "blob", mode: "100644", path: "convex.json", sha: "root-sha" },
          {
            type: "blob",
            mode: "100755",
            path: "apps/web/convex.json",
            sha: "web-sha",
          },
          {
            type: "blob",
            mode: "100644",
            path: "apps/admin/convex.json",
            sha: "admin-sha",
          },
          {
            type: "blob",
            mode: "120000",
            path: "linked/convex.json",
            sha: "symlink-sha",
          },
          {
            type: "commit",
            mode: "160000",
            path: "vendor/convex.json",
            sha: "submodule-sha",
          },
          { type: "blob", mode: "100644", path: "Convex.json", sha: "case-sha" },
        ],
      },
    });
    await expect(
      fetchGitHubConvexCodeLocationDiscovery({
        githubAccess,
      }),
    ).resolves.toEqual({
      completeness: "partial",
      defaultBranch: "master",
      commitSha: "commit-sha",
      treeSha: "tree-sha",
      locations: [
        {
          kind: "config",
          convexConfigPath: "apps/admin/convex.json",
          rootDirectory: "apps/admin",
          blobSha: "admin-sha",
        },
        {
          kind: "config",
          convexConfigPath: "apps/web/convex.json",
          rootDirectory: "apps/web",
          blobSha: "web-sha",
        },
        {
          kind: "config",
          convexConfigPath: "convex.json",
          rootDirectory: "/",
          blobSha: "root-sha",
        },
      ],
    });
    expect(octokitMocks.getRef).toHaveBeenCalledWith({
      owner: "octocat",
      repo: "Hello-World",
      ref: "heads/master",
    });
    expect(octokitMocks.getBlob).not.toHaveBeenCalled();
  });

  it("discovers default Convex directories beside package.json without reading file contents", async () => {
    octokitMocks.getTree.mockResolvedValue({
      data: {
        truncated: false,
        tree: [
          { type: "blob", mode: "100644", path: "package.json", sha: "root-package-sha" },
          { type: "tree", mode: "040000", path: "convex", sha: "root-convex-sha" },
          {
            type: "blob",
            mode: "100644",
            path: "apps/web/package.json",
            sha: "web-package-sha",
          },
          {
            type: "tree",
            mode: "040000",
            path: "apps/web/convex",
            sha: "web-convex-sha",
          },
          {
            type: "blob",
            mode: "100644",
            path: "apps/configured/package.json",
            sha: "configured-package-sha",
          },
          {
            type: "tree",
            mode: "040000",
            path: "apps/configured/convex",
            sha: "configured-convex-sha",
          },
          {
            type: "blob",
            mode: "100644",
            path: "apps/configured/convex.json",
            sha: "configured-config-sha",
          },
          {
            type: "tree",
            mode: "040000",
            path: "apps/no-package/convex",
            sha: "no-package-convex-sha",
          },
          {
            type: "blob",
            mode: "100644",
            path: "apps/no-convex/package.json",
            sha: "no-convex-package-sha",
          },
          {
            type: "blob",
            mode: "100644",
            path: "apps/not-a-tree/convex",
            sha: "convex-blob-sha",
          },
          {
            type: "tree",
            mode: "040000",
            path: "apps/case/Convex",
            sha: "case-convex-sha",
          },
        ],
      },
    });
    await expect(
      fetchGitHubConvexCodeLocationDiscovery({
        githubAccess,
      }),
    ).resolves.toEqual({
      completeness: "complete",
      defaultBranch: "master",
      commitSha: "commit-sha",
      treeSha: "tree-sha",
      locations: [
        {
          kind: "config",
          convexConfigPath: "apps/configured/convex.json",
          rootDirectory: "apps/configured",
          blobSha: "configured-config-sha",
        },
        {
          kind: "directory",
          convexDirectoryPath: "apps/web/convex",
          rootDirectory: "apps/web",
          convexDirectoryTreeSha: "web-convex-sha",
          packageJsonPath: "apps/web/package.json",
          packageJsonBlobSha: "web-package-sha",
        },
        {
          kind: "directory",
          convexDirectoryPath: "convex",
          rootDirectory: "/",
          convexDirectoryTreeSha: "root-convex-sha",
          packageJsonPath: "package.json",
          packageJsonBlobSha: "root-package-sha",
        },
      ],
    });
    expect(octokitMocks.getBlob).not.toHaveBeenCalled();
  });

  it("rejects a repository transfer without changing Samebase ownership", async () => {
    octokitMocks.request.mockResolvedValue({
      data: { total_count: 1, repositories: [officialRepositoryIdentity] },
    });

    await expect(
      resolveGitHubInstallationRepositoryIdentity({
        octokit,
        expectedOwnerId: "2",
        expectedRepoId: "1296269",
      }),
    ).rejects.toThrow(
      "GitHub repository owner changed. Remove this vault and connect the repository under its current owner.",
    );
  });

  it("rejects a repository that the installation cannot access", async () => {
    octokitMocks.request.mockResolvedValue({
      data: { total_count: 0, repositories: [] },
    });

    await expect(
      resolveGitHubInstallationRepositoryIdentity({
        octokit,
        ...repositoryTarget,
      }),
    ).rejects.toThrow("GitHub App installation cannot access the vault repository.");
  });
});
