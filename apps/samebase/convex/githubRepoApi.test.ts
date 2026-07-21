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

import { fetchGitHubConvexConfigDiscovery } from "./githubRepoApi";

function encodeBlob(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64");
}

describe("GitHub Convex config discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.getRepository.mockResolvedValue({
      data: { id: 123, default_branch: "trunk", owner: { id: 456 } },
    });
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: "commit-sha" } } });
    octokitMocks.getCommit.mockResolvedValue({ data: { tree: { sha: "tree-sha" } } });
  });

  it("reads exact regular convex.json blobs from the current default branch", async () => {
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
    const contents = new Map([
      ["root-sha", "{}"],
      ["web-sha", '{"functions":"convex"}'],
      ["admin-sha", '{"functions":'],
    ]);
    octokitMocks.getBlob.mockImplementation(async ({ file_sha }: { file_sha: string }) => ({
      data: { encoding: "base64", content: encodeBlob(contents.get(file_sha) ?? "") },
    }));

    await expect(
      fetchGitHubConvexConfigDiscovery({
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
      configs: [
        {
          state: "invalid",
          convexConfigPath: "apps/admin/convex.json",
          rootDirectory: "apps/admin",
          blobSha: "admin-sha",
          reason: "invalid_json_object",
        },
        {
          state: "valid",
          convexConfigPath: "apps/web/convex.json",
          rootDirectory: "apps/web",
          blobSha: "web-sha",
        },
        {
          state: "valid",
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
    expect(octokitMocks.getBlob).toHaveBeenCalledTimes(3);
  });

  it("rejects a repository whose immutable id no longer matches the vault", async () => {
    octokitMocks.getRepository.mockResolvedValue({
      data: { id: 999, default_branch: "main", owner: { id: 456 } },
    });

    await expect(
      fetchGitHubConvexConfigDiscovery({
        githubAccessToken: "github-token",
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
      }),
    ).rejects.toThrow("GitHub repository response did not match the vault repo.");
    expect(octokitMocks.getRef).not.toHaveBeenCalled();
  });
});
