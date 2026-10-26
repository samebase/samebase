import { describe, expect, it } from "vite-plus/test";
import {
  readExactRepositoryBranch,
  describeRepositoryTreeRefreshFailure,
} from "./repositoryRefresh";

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
