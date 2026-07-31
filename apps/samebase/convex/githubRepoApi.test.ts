import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const octokitMocks = vi.hoisted(() => ({
  getRepository: vi.fn(),
  getRef: vi.fn(),
  getCommit: vi.fn(),
  getTree: vi.fn(),
  getBlob: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly rest = {
      repos: { get: octokitMocks.getRepository },
      git: {
        getRef: octokitMocks.getRef,
        getCommit: octokitMocks.getCommit,
        getTree: octokitMocks.getTree,
        getBlob: octokitMocks.getBlob,
      },
    };
  },
}));

import {
  fetchGitHubConvexCodeLocationDiscovery,
  fetchGitHubDefaultBranchHead,
  fetchGitHubRepoIdentity,
} from "./githubRepoApi";

describe("GitHub repository API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.getRepository.mockResolvedValue({
      data: { id: 123, default_branch: "trunk", owner: { id: 456 } },
    });
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: "commit-sha" } } });
    octokitMocks.getCommit.mockResolvedValue({ data: { tree: { sha: "tree-sha" } } });
  });

  it("passes the caller's abort deadline to the repository identity request", async () => {
    const signal = new AbortController().signal;

    await expect(
      fetchGitHubRepoIdentity({
        githubAccessToken: "github-token",
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
        signal,
      }),
    ).resolves.toEqual({ ownerId: "456", defaultBranch: "trunk" });
    expect(octokitMocks.getRepository).toHaveBeenCalledWith({
      owner: "samebase",
      repo: "samebase",
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
        githubAccessToken: "github-token",
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
        signal,
        recordApiCall: async (call) => {
          calls.push(call);
        },
      }),
    ).resolves.toEqual({
      defaultBranch: "trunk",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(octokitMocks.getRef).toHaveBeenCalledWith({
      owner: "samebase",
      repo: "samebase",
      ref: "heads/trunk",
      request: { signal },
    });
    expect(calls).toEqual([
      expect.objectContaining({ endpoint: "/repos/{owner}/{repo}" }),
      expect.objectContaining({ endpoint: "/repos/{owner}/{repo}/git/ref/{ref}" }),
    ]);
  });

  it("rejects a default-branch ref that is not a full commit SHA", async () => {
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: "short-sha" } } });

    await expect(
      fetchGitHubDefaultBranchHead({
        githubAccessToken: "github-token",
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
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
        githubAccessToken: "github-token",
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
      }),
    ).resolves.toEqual({
      completeness: "partial",
      defaultBranch: "trunk",
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
      owner: "samebase",
      repo: "samebase",
      ref: "heads/trunk",
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
        githubAccessToken: "github-token",
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
      }),
    ).resolves.toEqual({
      completeness: "complete",
      defaultBranch: "trunk",
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

  it("rejects a repository whose immutable id no longer matches the vault", async () => {
    octokitMocks.getRepository.mockResolvedValue({
      data: { id: 999, default_branch: "main", owner: { id: 456 } },
    });

    await expect(
      fetchGitHubConvexCodeLocationDiscovery({
        githubAccessToken: "github-token",
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
      }),
    ).rejects.toThrow("GitHub repository response did not match the vault repo.");
    expect(octokitMocks.getRef).not.toHaveBeenCalled();
  });
});
