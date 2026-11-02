import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const octokitMocks = vi.hoisted(() => ({
  getRepository: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly rest = {
      repos: { get: octokitMocks.getRepository },
    };
  },
}));

import { Octokit } from "@octokit/rest";
import { fetchGitHubRepoIdentity } from "./githubRepoApi";

const octokit = new Octokit();

describe("GitHub repository API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.getRepository.mockResolvedValue({
      data: { id: 123, default_branch: "trunk", owner: { id: 456 } },
    });
  });

  it("passes the caller's abort deadline to the repository identity request", async () => {
    const signal = new AbortController().signal;

    await expect(
      fetchGitHubRepoIdentity({
        octokit,
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

  it("rejects a repository whose immutable id no longer matches the Samebase repository", async () => {
    octokitMocks.getRepository.mockResolvedValue({
      data: { id: 999, default_branch: "main", owner: { id: 456 } },
    });

    await expect(
      fetchGitHubRepoIdentity({
        octokit,
        owner: "samebase",
        repo: "samebase",
        expectedRepoId: "123",
      }),
    ).rejects.toThrow("GitHub repository response did not match the Samebase repository.");
  });
});
