import { describe, it, expect, vi, beforeEach } from "vitest";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import { createCommitWithMultipleFiles as realCreateCommitWithMultipleFiles } from "./fileStagingActions";

type GitApi = RestEndpointMethodTypes["git"];
type GetRefResponse = GitApi["getRef"]["response"];
type GetCommitResponse = GitApi["getCommit"]["response"];
type CreateTreeResponse = GitApi["createTree"]["response"];
type CreateCommitResponse = GitApi["createCommit"]["response"];
type UpdateRefResponse = GitApi["updateRef"]["response"];
type GetTreeResponse = GitApi["getTree"]["response"];
type GetBlobResponse = GitApi["getBlob"]["response"];

type GetRefData = GitApi["getRef"]["response"]["data"];
type GetCommitData = GitApi["getCommit"]["response"]["data"];
type CreateTreeData = GitApi["createTree"]["response"]["data"];
type CreateCommitData = GitApi["createCommit"]["response"]["data"];
type UpdateRefData = GitApi["updateRef"]["response"]["data"];
type GetTreeData = GitApi["getTree"]["response"]["data"];
type GetBlobData = GitApi["getBlob"]["response"]["data"];

const emptyHeaders: Record<string, string> = {};

const makeRefData = (sha: string): GetRefData => ({
  ref: "refs/heads/main",
  node_id: "node-id",
  url: "https://api.github.com/repos/test-owner/test-repo/git/refs/heads/main",
  object: {
    type: "commit",
    sha,
    url: `https://api.github.com/repos/test-owner/test-repo/git/commits/${sha}`,
  },
});

const makeGetRefResponse = (sha: string): GetRefResponse => ({
  status: 200,
  url: "https://api.github.com/",
  headers: emptyHeaders,
  data: makeRefData(sha),
});

const makeAuthor = () => ({
  name: "Test Author",
  email: "author@example.com",
  date: "2020-01-01T00:00:00Z",
});

const makeGetCommitResponse = (
  treeSha: string,
  commitSha: string,
): GetCommitResponse => ({
  status: 200,
  url: `https://api.github.com/repos/test-owner/test-repo/git/commits/${commitSha}`,
  headers: emptyHeaders,
  data: {
    sha: commitSha,
    node_id: "node-id",
    url: `https://api.github.com/repos/test-owner/test-repo/git/commits/${commitSha}`,
    author: makeAuthor(),
    committer: makeAuthor(),
    message: "Test commit",
    tree: {
      sha: treeSha,
      url: `https://api.github.com/repos/test-owner/test-repo/git/trees/${treeSha}`,
    },
    parents: [],
    verification: {
      verified: false,
      reason: "unsigned",
      signature: null,
      payload: null,
      verified_at: null,
    },
    html_url: `https://github.com/test-owner/test-repo/commit/${commitSha}`,
  } satisfies GetCommitData,
});

const makeCreateTreeResponse = (treeSha: string): CreateTreeResponse => ({
  status: 201,
  url: `https://api.github.com/repos/test-owner/test-repo/git/trees/${treeSha}`,
  headers: emptyHeaders,
  data: {
    sha: treeSha,
    url: `https://api.github.com/repos/test-owner/test-repo/git/trees/${treeSha}`,
    tree: [],
    truncated: false,
  } satisfies CreateTreeData,
});

const makeCreateCommitResponse = (
  treeSha: string,
  commitSha: string,
): CreateCommitResponse => ({
  status: 201,
  url: `https://api.github.com/repos/test-owner/test-repo/git/commits/${commitSha}`,
  headers: emptyHeaders,
  data: {
    sha: commitSha,
    node_id: "node-id",
    url: `https://api.github.com/repos/test-owner/test-repo/git/commits/${commitSha}`,
    author: makeAuthor(),
    committer: makeAuthor(),
    message: "Test commit",
    tree: {
      sha: treeSha,
      url: `https://api.github.com/repos/test-owner/test-repo/git/trees/${treeSha}`,
    },
    parents: [],
    verification: {
      verified: false,
      reason: "unsigned",
      signature: null,
      payload: null,
      verified_at: null,
    },
    html_url: `https://github.com/test-owner/test-repo/commit/${commitSha}`,
  } satisfies CreateCommitData,
});

const makeUpdateRefResponse = (sha: string): UpdateRefResponse => ({
  status: 200,
  url: "https://api.github.com/",
  headers: emptyHeaders,
  data: makeRefData(sha) satisfies UpdateRefData,
});

const makeGetTreeResponse = (
  treeSha: string,
  blobs: Array<{ path: string; sha: string }>,
  options?: {
    truncated?: boolean;
  },
): GetTreeResponse => ({
  status: 200,
  url: `https://api.github.com/repos/test-owner/test-repo/git/trees/${treeSha}`,
  headers: emptyHeaders,
  data: {
    sha: treeSha,
    url: `https://api.github.com/repos/test-owner/test-repo/git/trees/${treeSha}`,
    truncated: options?.truncated ?? false,
    tree: blobs.map((blob) => ({
      path: blob.path,
      mode: "100644",
      type: "blob" as const,
      sha: blob.sha,
      size: 10,
      url: `https://api.github.com/repos/test-owner/test-repo/git/blobs/${blob.sha}`,
    })),
  } satisfies GetTreeData,
});

const makeGetBlobResponse = (sha: string, text: string): GetBlobResponse => ({
  status: 200,
  url: `https://api.github.com/repos/test-owner/test-repo/git/blobs/${sha}`,
  headers: emptyHeaders,
  data: {
    sha,
    node_id: "blob-node-id",
    size: Buffer.byteLength(text, "utf-8"),
    url: `https://api.github.com/repos/test-owner/test-repo/git/blobs/${sha}`,
    content: Buffer.from(text, "utf-8").toString("base64"),
    encoding: "base64",
  } satisfies GetBlobData,
});

describe("createCommitWithMultipleFiles (real implementation)", () => {
  let octokit: Octokit;

  beforeEach(() => {
    vi.restoreAllMocks();
    octokit = new Octokit({ auth: "test" });
  });

  it("replays staged edit on latest upstream head when non-overlapping", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("tree-sha-1", [
        { path: "src/app.ts", sha: "blob-sha-upstream" },
      ]),
    );
    vi.spyOn(octokit.rest.git, "getBlob").mockResolvedValue(
      makeGetBlobResponse("blob-sha-upstream", "line-1-upstream\nline-2\n"),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("new-tree-sha"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("new-tree-sha", "new-commit-sha"),
    );
    const updateRefSpy = vi
      .spyOn(octokit.rest.git, "updateRef")
      .mockResolvedValue(makeUpdateRefResponse("new-commit-sha"));

    const result = await realCreateCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "src/app.ts",
          initialFilePath: "src/app.ts",
          fileDeleted: false,
          parentCommitSha: "initial-parent-sha",
          initialContent: "line-1\nline-2\n",
          content: "line-1\nline-2\nline-3-local\n",
        },
      ],
    });

    expect(result.sha).toBe("new-commit-sha");
    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    const createdAppEntry = createTreeCall.tree.find(
      (entry) => entry.path === "src/app.ts",
    );
    if (!createdAppEntry || !("content" in createdAppEntry)) {
      throw new Error("Expected src/app.ts tree content entry");
    }
    expect(createdAppEntry.content).toBe(
      "line-1-upstream\nline-2\nline-3-local\n",
    );

    const updateRefCall = updateRefSpy.mock.calls[0]?.[0];
    expect(updateRefCall?.force).toBe(false);
  });

  it("aborts commit with explicit path list when upstream conflict is unresolved", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("tree-sha-1", []),
    );
    const createTreeSpy = vi.spyOn(octokit.rest.git, "createTree");
    const updateRefSpy = vi.spyOn(octokit.rest.git, "updateRef");

    await expect(
      realCreateCommitWithMultipleFiles({
        octokit,
        owner: "test-owner",
        repo: "test-repo",
        branch: "main",
        stagedFiles: [
          {
            filePath: "src/missing.ts",
            initialFilePath: "src/missing.ts",
            fileDeleted: false,
            parentCommitSha: "initial-parent-sha",
            initialContent: "old\n",
            content: "new\n",
          },
        ],
      }),
    ).rejects.toThrow(
      "Commit conflicts with upstream changes. Resolve and retry: src/missing.ts",
    );
    expect(createTreeSpy).not.toHaveBeenCalled();
    expect(updateRefSpy).not.toHaveBeenCalled();
  });

  it("retries with latest head when updateRef fails with non-fast-forward race", async () => {
    vi.spyOn(octokit.rest.git, "getRef")
      .mockResolvedValueOnce(makeGetRefResponse("head-sha-stale"))
      .mockResolvedValueOnce(makeGetRefResponse("head-sha-fresh"));
    vi.spyOn(octokit.rest.git, "getCommit")
      .mockResolvedValueOnce(
        makeGetCommitResponse("tree-sha-stale", "head-sha-stale"),
      )
      .mockResolvedValueOnce(
        makeGetCommitResponse("tree-sha-fresh", "head-sha-fresh"),
      );
    vi.spyOn(octokit.rest.git, "getTree")
      .mockResolvedValueOnce(
        makeGetTreeResponse("tree-sha-stale", [
          { path: "src/app.ts", sha: "blob-sha-stale" },
        ]),
      )
      .mockResolvedValueOnce(
        makeGetTreeResponse("tree-sha-fresh", [
          { path: "src/app.ts", sha: "blob-sha-fresh" },
        ]),
      );
    vi.spyOn(octokit.rest.git, "getBlob").mockImplementation((params) => {
      const fileSha = params?.file_sha;
      if (fileSha === "blob-sha-stale") {
        return Promise.resolve(
          makeGetBlobResponse("blob-sha-stale", "line-1\nline-2\n"),
        );
      }
      if (fileSha === "blob-sha-fresh") {
        return Promise.resolve(
          makeGetBlobResponse("blob-sha-fresh", "line-1-upstream\nline-2\n"),
        );
      }
      return Promise.reject(
        new Error(`Unexpected blob sha: ${fileSha ?? "undefined"}`),
      );
    });

    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValueOnce(makeCreateTreeResponse("tree-created-1"))
      .mockResolvedValueOnce(makeCreateTreeResponse("tree-created-2"));
    const createCommitSpy = vi
      .spyOn(octokit.rest.git, "createCommit")
      .mockResolvedValueOnce(
        makeCreateCommitResponse("tree-created-1", "commit-created-1"),
      )
      .mockResolvedValueOnce(
        makeCreateCommitResponse("tree-created-2", "commit-created-2"),
      );
    const nonFastForward = Object.assign(new Error("Reference update failed"), {
      status: 409,
    });
    const updateRefSpy = vi
      .spyOn(octokit.rest.git, "updateRef")
      .mockRejectedValueOnce(nonFastForward)
      .mockResolvedValueOnce(makeUpdateRefResponse("commit-created-2"));

    const result = await realCreateCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "src/app.ts",
          initialFilePath: "src/app.ts",
          fileDeleted: false,
          parentCommitSha: "initial-parent-sha",
          initialContent: "line-1\nline-2\n",
          content: "line-1\nline-2\nline-3-local\n",
        },
      ],
    });

    expect(result.sha).toBe("commit-created-2");
    expect(updateRefSpy).toHaveBeenCalledTimes(2);
    expect(createTreeSpy).toHaveBeenCalledTimes(2);
    expect(createCommitSpy).toHaveBeenCalledTimes(2);
    const secondCreateCommitCall = createCommitSpy.mock.calls[1]?.[0];
    expect(secondCreateCommitCall?.parents).toEqual(["head-sha-fresh"]);

    const secondCreateTreeCall = createTreeSpy.mock.calls[1]?.[0];
    const refreshedEntry = secondCreateTreeCall?.tree.find(
      (entry) => entry.path === "src/app.ts",
    );
    if (!refreshedEntry || !("content" in refreshedEntry)) {
      throw new Error("Expected refreshed src/app.ts content entry");
    }
    expect(refreshedEntry.content).toBe(
      "line-1-upstream\nline-2\nline-3-local\n",
    );
  });

  it("treats new-file path collisions as conflicts", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("tree-sha-1", [
        { path: "src/new-file.ts", sha: "blob-existing" },
      ]),
    );
    vi.spyOn(octokit.rest.git, "getBlob").mockResolvedValue(
      makeGetBlobResponse("blob-existing", "upstream-content\n"),
    );
    const createTreeSpy = vi.spyOn(octokit.rest.git, "createTree");

    await expect(
      realCreateCommitWithMultipleFiles({
        octokit,
        owner: "test-owner",
        repo: "test-repo",
        branch: "main",
        stagedFiles: [
          {
            filePath: "src/new-file.ts",
            initialFilePath: "src/new-file.ts",
            fileDeleted: false,
            parentCommitSha: null,
            initialContent: "",
            content: "local-content\n",
          },
        ],
      }),
    ).rejects.toThrow(
      "Commit conflicts with upstream changes. Resolve and retry: src/new-file.ts",
    );
    expect(createTreeSpy).not.toHaveBeenCalled();
  });

  it("treats rename target collisions as conflicts", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("tree-sha-1", [
        { path: "src/old-name.ts", sha: "blob-old" },
        { path: "src/new-name.ts", sha: "blob-existing-target" },
      ]),
    );
    vi.spyOn(octokit.rest.git, "getBlob").mockImplementation((params) => {
      const fileSha = params?.file_sha;
      if (fileSha === "blob-old") {
        return Promise.resolve(makeGetBlobResponse("blob-old", "line-1\n"));
      }
      if (fileSha === "blob-existing-target") {
        return Promise.resolve(
          makeGetBlobResponse("blob-existing-target", "target-content\n"),
        );
      }
      return Promise.reject(
        new Error(`Unexpected blob sha: ${fileSha ?? "undefined"}`),
      );
    });
    const createTreeSpy = vi.spyOn(octokit.rest.git, "createTree");

    await expect(
      realCreateCommitWithMultipleFiles({
        octokit,
        owner: "test-owner",
        repo: "test-repo",
        branch: "main",
        stagedFiles: [
          {
            filePath: "src/new-name.ts",
            initialFilePath: "src/old-name.ts",
            fileDeleted: false,
            parentCommitSha: "parent-sha",
            initialContent: "line-1\n",
            content: "line-1\nline-2\n",
          },
        ],
      }),
    ).rejects.toThrow(
      "Commit conflicts with upstream changes. Resolve and retry: src/new-name.ts",
    );
    expect(createTreeSpy).not.toHaveBeenCalled();
  });

  it("treats upstream missing file as no-op for staged deletions", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("tree-sha-1", []),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("new-tree-sha"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("new-tree-sha", "new-commit-sha"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("new-commit-sha"),
    );

    await realCreateCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "src/deleted.ts",
          initialFilePath: "src/deleted.ts",
          fileDeleted: true,
          parentCommitSha: "initial-parent-sha",
          initialContent: "old-content\n",
          content: "old-content\n",
        },
      ],
    });

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    expect(createTreeCall?.tree).toHaveLength(0);
  });

  it("skips deletion for staged files that were never committed upstream", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("tree-sha-1", [
        { path: "src/new-file.ts", sha: "blob-unrelated-upstream" },
      ]),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("new-tree-sha"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("new-tree-sha", "new-commit-sha"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("new-commit-sha"),
    );

    await realCreateCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "src/new-file.ts",
          initialFilePath: "src/new-file.ts",
          fileDeleted: true,
          parentCommitSha: null,
          initialContent: "",
          content: "",
        },
      ],
    });

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    expect(createTreeCall?.tree).toHaveLength(0);
  });

  it("deletes renamed files using the original upstream path", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("tree-sha-1", [
        { path: "src/old-name.ts", sha: "blob-old" },
      ]),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("new-tree-sha"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("new-tree-sha", "new-commit-sha"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("new-commit-sha"),
    );

    await realCreateCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "src/new-name.ts",
          initialFilePath: "src/old-name.ts",
          fileDeleted: true,
          parentCommitSha: "initial-parent-sha",
          initialContent: "old-content\n",
          content: "old-content\n",
        },
      ],
    });

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    expect(createTreeCall?.tree).toHaveLength(1);
    expect(createTreeCall?.tree[0]).toMatchObject({
      path: "src/old-name.ts",
      sha: null,
    });
  });

  it("fails fast when GitHub returns a truncated recursive tree", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree-sha-1", "head-sha-1"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse(
        "tree-sha-1",
        [{ path: "src/app.ts", sha: "blob-sha-upstream" }],
        { truncated: true },
      ),
    );
    const createTreeSpy = vi.spyOn(octokit.rest.git, "createTree");

    await expect(
      realCreateCommitWithMultipleFiles({
        octokit,
        owner: "test-owner",
        repo: "test-repo",
        branch: "main",
        stagedFiles: [
          {
            filePath: "src/app.ts",
            initialFilePath: "src/app.ts",
            fileDeleted: false,
            parentCommitSha: "parent-sha",
            initialContent: "old\n",
            content: "new\n",
          },
        ],
      }),
    ).rejects.toThrow(
      "Upstream tree is too large to resolve fully; cannot verify conflict-free commit.",
    );
    expect(createTreeSpy).not.toHaveBeenCalled();
  });

  it("retries blob fetch after transient 422 instead of reusing rejected cache", async () => {
    vi.spyOn(octokit.rest.git, "getRef")
      .mockResolvedValueOnce(makeGetRefResponse("head-sha-1"))
      .mockResolvedValueOnce(makeGetRefResponse("head-sha-2"));
    vi.spyOn(octokit.rest.git, "getCommit")
      .mockResolvedValueOnce(makeGetCommitResponse("tree-sha-1", "head-sha-1"))
      .mockResolvedValueOnce(makeGetCommitResponse("tree-sha-2", "head-sha-2"));
    vi.spyOn(octokit.rest.git, "getTree")
      .mockResolvedValueOnce(
        makeGetTreeResponse("tree-sha-1", [
          { path: "src/app.ts", sha: "blob-sha-upstream" },
        ]),
      )
      .mockResolvedValueOnce(
        makeGetTreeResponse("tree-sha-2", [
          { path: "src/app.ts", sha: "blob-sha-upstream" },
        ]),
      );
    const transientBlobError = Object.assign(new Error("Bad object state"), {
      status: 422,
    });
    const getBlobSpy = vi
      .spyOn(octokit.rest.git, "getBlob")
      .mockRejectedValueOnce(transientBlobError)
      .mockResolvedValueOnce(
        makeGetBlobResponse("blob-sha-upstream", "line-1-upstream\nline-2\n"),
      );
    vi.spyOn(octokit.rest.git, "createTree").mockResolvedValue(
      makeCreateTreeResponse("new-tree-sha"),
    );
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("new-tree-sha", "new-commit-sha"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("new-commit-sha"),
    );

    const result = await realCreateCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "src/app.ts",
          initialFilePath: "src/app.ts",
          fileDeleted: false,
          parentCommitSha: "initial-parent-sha",
          initialContent: "line-1\nline-2\n",
          content: "line-1\nline-2\nline-3-local\n",
        },
      ],
    });

    expect(result.sha).toBe("new-commit-sha");
    expect(getBlobSpy).toHaveBeenCalledTimes(2);
  });
});
