import { describe, it, expect, vi, beforeEach } from "vitest";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import {
  buildDraftPullRequestTitle,
  createCommitWithMultipleFiles,
  getDraftPullRequestCreateErrorMessage,
  inspectStagedFilesAgainstLatestHead,
  readOpenPullRequestForBranch,
} from "./fileStagingActions";

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
type CreateTreeEntry = NonNullable<
  GitApi["createTree"]["parameters"]["tree"]
>[number];

function hasInlineContent(
  entry: CreateTreeEntry,
): entry is CreateTreeEntry & { content: string } {
  return "content" in entry && typeof entry.content === "string";
}

function readInlineContent(entry: CreateTreeEntry | undefined): string {
  if (!entry || !hasInlineContent(entry)) {
    throw new Error("Expected tree entry with inline content");
  }
  return entry.content;
}

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

describe("draft pull request helpers", () => {
  it("matches the current branch pull request in the same repository", () => {
    expect(
      readOpenPullRequestForBranch({
        branch: "feature-branch",
        baseBranch: "main",
        repositoryFullName: "test-owner/test-repo",
        pullRequests: [
          {
            number: 42,
            html_url: "https://github.com/test-owner/test-repo/pull/42",
            base: {
              ref: "main",
            },
            head: {
              ref: "feature-branch",
              repo: {
                full_name: "test-owner/test-repo",
              },
            },
          },
          {
            number: 43,
            html_url: "https://github.com/test-owner/other-repo/pull/43",
            base: {
              ref: "main",
            },
            head: {
              ref: "feature-branch",
              repo: {
                full_name: "test-owner/other-repo",
              },
            },
          },
        ],
      }),
    ).toEqual({
      url: "https://github.com/test-owner/test-repo/pull/42",
      number: 42,
    });
  });

  it("ignores an open pull request that targets a different base branch", () => {
    expect(
      readOpenPullRequestForBranch({
        branch: "feature-branch",
        baseBranch: "main",
        repositoryFullName: "test-owner/test-repo",
        pullRequests: [
          {
            number: 42,
            html_url: "https://github.com/test-owner/test-repo/pull/42",
            base: {
              ref: "release/1.2",
            },
            head: {
              ref: "feature-branch",
              repo: {
                full_name: "test-owner/test-repo",
              },
            },
          },
        ],
      }),
    ).toBeNull();
  });

  it("uses the latest commit subject for the draft PR title", () => {
    expect(
      buildDraftPullRequestTitle({
        branch: "feature-branch",
        commitMessage: "Add draft PR button\n\nExtra details",
      }),
    ).toBe("Add draft PR button");
  });

  it("returns a friendly message when the branch has no PR-worthy commits", () => {
    expect(
      getDraftPullRequestCreateErrorMessage({
        message:
          "Validation Failed: No commits between main and feature-branch",
      }),
    ).toBe("This branch has no changes to open as a pull request.");
  });
});

describe("createCommitWithMultipleFiles", () => {
  let octokit: Octokit;

  beforeEach(() => {
    vi.restoreAllMocks();
    octokit = new Octokit({ auth: "test" });
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("head-tree", []),
    );
  });

  /**
   * Test 1: Single file edit
   * Input: One modified file
   * Verify: Tree entry array contains only 1 blob entry
   * Verify: base_tree parameter is passed to createTree()
   */
  it("Test 1: Single file edit - creates only 1 tree entry with base_tree", async () => {
    // Setup mocks
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    const updateRefSpy = vi
      .spyOn(octokit.rest.git, "updateRef")
      .mockResolvedValue(makeUpdateRefResponse("commit123"));

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/file.ts",
          content: "new content",
          fileDeleted: false,
          initialFilePath: "src/file.ts",
          initialContent: "old content",
          parentCommitSha: "parent123",
        },
      ],
      branch: "main",
    });

    // Verify tree was created with only 1 entry using inline content
    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    expect(createTreeCall.tree.length).toBe(1);
    expect(createTreeCall.tree[0].path).toBe("src/file.ts");
    expect(readInlineContent(createTreeCall.tree[0])).toBe("new content");

    // Verify base_tree parameter is passed
    expect(createTreeCall.base_tree).toBe("tree123");
    expect(updateRefSpy).toHaveBeenCalledWith(
      expect.objectContaining({ force: false }),
    );
  });

  /**
   * Test 1b: Stale staged base with upstream-only insertion.
   * Input: initialContent misses a line now present upstream; local edit is non-overlapping.
   * Verify: commit content preserves the upstream-only line (no hidden deletion).
   */
  it("Test 1b: Rebases stale staged content to preserve upstream-only lines", async () => {
    const targetBranch = "feature/stale-rebase";
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const getTreeSpy = vi
      .spyOn(octokit.rest.git, "getTree")
      .mockResolvedValue(
        makeGetTreeResponse("head-tree", [
          { path: "TODO.md", sha: "upstream" },
        ]),
      );

    const upstreamContent = [
      "!!! github notes",
      "- [ ] asdfasdfdfsas",
      "- [ ] add excalidraw",
      "",
      "## Research & Inspiration",
      "- [ ] run a 2-week Augment Code pilot",
      "- [ ] video reference",
      "",
    ].join("\n");
    vi.spyOn(octokit.rest.git, "getBlob").mockResolvedValue(
      makeGetBlobResponse("upstream", upstreamContent),
    );

    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    const staleInitial = [
      "!!! github notes",
      "- [ ] asdfasdfdfsas",
      "- [ ] add excalidraw",
      "",
      "## Research & Inspiration",
      "- [ ] video reference",
      "",
    ].join("\n");
    const stagedContent = [
      "!!! github notes",
      "- [ ] replacement item",
      "- [ ] add excalidraw",
      "",
      "## Research & Inspiration",
      "- [ ] video reference",
      "",
    ].join("\n");

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "TODO.md",
          content: stagedContent,
          fileDeleted: false,
          initialFilePath: "TODO.md",
          initialContent: staleInitial,
          parentCommitSha: "stale-sha",
        },
      ],
      branch: targetBranch,
    });

    expect(getTreeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tree_sha: `heads/${targetBranch}`,
      }),
    );

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }

    const todoEntry = createTreeCall.tree.find(
      (entry) => entry.path === "TODO.md",
    );
    const committedContent = readInlineContent(todoEntry);
    expect(committedContent).toContain("- [ ] run a 2-week Augment Code pilot");
    expect(committedContent).toBe(
      [
        "!!! github notes",
        "- [ ] replacement item",
        "- [ ] add excalidraw",
        "",
        "## Research & Inspiration",
        "- [ ] run a 2-week Augment Code pilot",
        "- [ ] video reference",
        "",
      ].join("\n"),
    );
  });

  it("Test 1d: Rebases when parent SHA matches but initial content is stale", async () => {
    const targetBranch = "feature/stale-parent-sha";
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("head-tree", [{ path: "TODO.md", sha: "upstream" }]),
    );
    const getBlobSpy = vi
      .spyOn(octokit.rest.git, "getBlob")
      .mockResolvedValue(
        makeGetBlobResponse(
          "upstream",
          ["alpha", "beta", "gamma", "delta", ""].join("\n"),
        ),
      );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "TODO.md",
          content: ["alpha-updated", "beta", "gamma", ""].join("\n"),
          fileDeleted: false,
          initialFilePath: "TODO.md",
          initialContent: ["alpha", "beta", "gamma", ""].join("\n"),
          // Simulates stale metadata where parent SHA was updated without
          // synchronizing initialContent.
          parentCommitSha: "upstream",
        },
      ],
      branch: targetBranch,
    });

    expect(getBlobSpy).toHaveBeenCalledWith(
      expect.objectContaining({ file_sha: "upstream" }),
    );

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }

    const todoEntry = createTreeCall.tree.find(
      (entry) => entry.path === "TODO.md",
    );
    const committedContent = readInlineContent(todoEntry);
    expect(committedContent).toBe(
      ["alpha-updated", "beta", "gamma", "delta", ""].join("\n"),
    );
  });

  it("collects rebase conflict payloads for files that cannot apply cleanly", async () => {
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("head-tree", [{ path: "TODO.md", sha: "upstream" }]),
    );
    vi.spyOn(octokit.rest.git, "getBlob").mockResolvedValue(
      makeGetBlobResponse("upstream", ["alpha", "theirs", ""].join("\n")),
    );

    const inspection = await inspectStagedFilesAgainstLatestHead({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "TODO.md",
          content: ["alpha", "ours", ""].join("\n"),
          fileDeleted: false,
          initialFilePath: "TODO.md",
          initialContent: ["alpha", "base", ""].join("\n"),
          parentCommitSha: "base-sha",
          branch: "main",
        },
      ],
    });

    expect(inspection.rebasedFiles).toHaveLength(1);
    expect(inspection.conflicts).toHaveLength(1);
    expect(inspection.conflicts[0]).toMatchObject({
      filePath: "TODO.md",
      initialFilePath: "TODO.md",
      initialContent: ["alpha", "base", ""].join("\n"),
      content: ["alpha", "ours", ""].join("\n"),
      upstreamContent: ["alpha", "theirs", ""].join("\n"),
      upstreamSha: "upstream",
    });
  });

  it("marks delete-vs-upstream-edit as a conflict", async () => {
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("head-tree", [{ path: "TODO.md", sha: "upstream" }]),
    );
    vi.spyOn(octokit.rest.git, "getBlob").mockResolvedValue(
      makeGetBlobResponse("upstream", ["alpha", "theirs", ""].join("\n")),
    );

    const inspection = await inspectStagedFilesAgainstLatestHead({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "TODO.md",
          content: "",
          fileDeleted: true,
          initialFilePath: "TODO.md",
          initialContent: ["alpha", "base", ""].join("\n"),
          parentCommitSha: "base-sha",
          branch: "main",
        },
      ],
    });

    expect(inspection.conflicts).toHaveLength(1);
    expect(inspection.conflicts[0]).toMatchObject({
      fileDeleted: true,
      upstreamSha: "upstream",
      upstreamContent: ["alpha", "theirs", ""].join("\n"),
    });
  });

  it("marks add-vs-upstream-add with different content as a conflict", async () => {
    vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue(
      makeGetTreeResponse("head-tree", [{ path: "TODO.md", sha: "upstream" }]),
    );
    vi.spyOn(octokit.rest.git, "getBlob").mockResolvedValue(
      makeGetBlobResponse("upstream", "theirs\n"),
    );

    const inspection = await inspectStagedFilesAgainstLatestHead({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      stagedFiles: [
        {
          filePath: "TODO.md",
          content: "ours\n",
          fileDeleted: false,
          initialFilePath: "TODO.md",
          initialContent: "",
          parentCommitSha: null,
          branch: "main",
        },
      ],
    });

    expect(inspection.conflicts).toHaveLength(1);
    expect(inspection.conflicts[0]).toMatchObject({
      parentCommitSha: null,
      upstreamSha: "upstream",
      upstreamContent: "theirs\n",
    });
  });

  it("Test 1c: skipRebase avoids extra head-tree lookups", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const getTreeSpy = vi.spyOn(octokit.rest.git, "getTree");
    const getBlobSpy = vi.spyOn(octokit.rest.git, "getBlob");
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/file.ts",
          content: "new content",
          fileDeleted: false,
          initialFilePath: "src/file.ts",
          initialContent: "old content",
          parentCommitSha: "parent123",
        },
      ],
      branch: "main",
      skipRebase: true,
    });

    expect(getTreeSpy).not.toHaveBeenCalled();
    expect(getBlobSpy).not.toHaveBeenCalled();

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    expect(createTreeCall.tree.length).toBe(1);
    expect(createTreeCall.tree[0].path).toBe("src/file.ts");
    expect(readInlineContent(createTreeCall.tree[0])).toBe("new content");
  });

  /**
   * Test 2: File deletion
   * Input: One deleted file
   * Verify: Tree entry for deleted file has sha: null
   */
  it("Test 2: File deletion - creates tree entry with sha null", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/deleted.ts",
          content: "",
          fileDeleted: true,
          initialFilePath: "src/deleted.ts",
          initialContent: "deleted content",
          parentCommitSha: "parent123",
        },
      ],
      branch: "main",
    });

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    expect(createTreeCall.tree.length).toBe(1);
    expect(createTreeCall.tree[0].path).toBe("src/deleted.ts");
    expect(createTreeCall.tree[0].sha).toBe(null);
  });

  /**
   * Test 3: File rename
   * Input: One file with different initial path and new path
   * Verify: Tree entries contain deletion of old path AND addition of new path
   */
  it("Test 3: File rename - creates entries for old and new paths", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/new-name.ts",
          content: "file content",
          fileDeleted: false,
          initialFilePath: "src/old-name.ts",
          initialContent: "file content",
          parentCommitSha: "parent123",
        },
      ],
      branch: "main",
    });

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    // Should have 2 entries: deletion of old path + addition of new path
    expect(createTreeCall.tree.length).toBe(2);

    const deletionEntry = createTreeCall.tree.find(
      (entry) => entry.path === "src/old-name.ts",
    );
    const additionEntry = createTreeCall.tree.find(
      (entry) => entry.path === "src/new-name.ts",
    );

    expect(deletionEntry).toBeDefined();
    expect(additionEntry).toBeDefined();
    if (!deletionEntry || !additionEntry) {
      throw new Error("Expected rename entries to be present");
    }
    expect(deletionEntry.sha).toBe(null);
    expect(readInlineContent(additionEntry)).toBe("file content");
  });

  /**
   * Test 4: Mixed changes
   * Input: 2 edits + 1 deletion + 1 rename
   * Verify: Tree entries contain exactly 5 entries (2 edits + 1 delete + 1 old path delete + 1 new path add)
   * Verify: No full tree reconstruction happens (base_tree is used)
   */
  it("Test 4: Mixed changes - handles edits, deletes, and renames", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/edit1.ts",
          content: "new content 1",
          fileDeleted: false,
          initialFilePath: "src/edit1.ts",
          initialContent: "old content 1",
          parentCommitSha: "parent1",
        },
        {
          filePath: "src/edit2.ts",
          content: "new content 2",
          fileDeleted: false,
          initialFilePath: "src/edit2.ts",
          initialContent: "old content 2",
          parentCommitSha: "parent2",
        },
        {
          filePath: "src/deleted.ts",
          content: "",
          fileDeleted: true,
          initialFilePath: "src/deleted.ts",
          initialContent: "deleted content",
          parentCommitSha: "parent3",
        },
        {
          filePath: "src/renamed-new.ts",
          content: "renamed content",
          fileDeleted: false,
          initialFilePath: "src/renamed-old.ts",
          initialContent: "renamed content",
          parentCommitSha: "parent4",
        },
      ],
      branch: "main",
    });

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    // Should have 5 entries: 2 edits + 1 delete + 1 old rename delete + 1 new rename add
    expect(createTreeCall.tree.length).toBe(5);

    // Verify base_tree is used
    expect(createTreeCall.base_tree).toBe("tree123");

    // Verify all paths are present
    const paths = createTreeCall.tree
      .map((entry) => entry.path)
      .filter((path): path is string => typeof path === "string");
    expect(paths).toContain("src/edit1.ts");
    expect(paths).toContain("src/edit2.ts");
    expect(paths).toContain("src/deleted.ts");
    expect(paths).toContain("src/renamed-old.ts");
    expect(paths).toContain("src/renamed-new.ts");

    // Verify content-based entries for additions
    const edit1Entry = createTreeCall.tree.find(
      (e) => e.path === "src/edit1.ts",
    );
    expect(readInlineContent(edit1Entry)).toBe("new content 1");
  });

  /**
   * Test 5: Retry on 422
   * Input: createTree fails with 422 on first attempt, succeeds on second
   * Verify: getRef is called twice (re-fetched on retry)
   * Verify: Commit succeeds on retry
   */
  it("Test 5: Retries on 422 error and succeeds on second attempt", async () => {
    const getRefSpy = vi
      .spyOn(octokit.rest.git, "getRef")
      .mockResolvedValueOnce(makeGetRefResponse("stale-sha"))
      .mockResolvedValueOnce(makeGetRefResponse("fresh-sha"));

    vi.spyOn(octokit.rest.git, "getCommit")
      .mockResolvedValueOnce(makeGetCommitResponse("stale-tree", "stale-sha"))
      .mockResolvedValueOnce(makeGetCommitResponse("fresh-tree", "fresh-sha"));

    const error422 = Object.assign(new Error("GitRPC::BadObjectState"), {
      status: 422,
    });
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockRejectedValueOnce(error422)
      .mockResolvedValueOnce(makeCreateTreeResponse("newtree123"));

    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    const result = await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/file.ts",
          content: "new content",
          fileDeleted: false,
          initialFilePath: "src/file.ts",
          initialContent: "old content",
          parentCommitSha: "parent123",
        },
      ],
      branch: "main",
    });

    // getRef called twice: once for stale attempt, once for fresh retry
    expect(getRefSpy).toHaveBeenCalledTimes(2);

    // createTree called twice: first 422, second success
    expect(createTreeSpy).toHaveBeenCalledTimes(2);

    // Second createTree used the fresh tree SHA
    const secondTreeCall = createTreeSpy.mock.calls[1]?.[0];
    expect(secondTreeCall?.base_tree).toBe("fresh-tree");

    // Commit succeeded
    expect(result.sha).toBe("commit123");
  });

  /**
   * Test 5b: Non-retryable errors are thrown immediately
   * Input: createTree fails with 500
   * Verify: No retry, error is thrown
   */
  it("Test 5b: Non-retryable errors are thrown immediately", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );

    const error500 = Object.assign(new Error("Internal Server Error"), {
      status: 500,
    });
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockRejectedValue(error500);

    await expect(
      createCommitWithMultipleFiles({
        octokit,
        owner: "test-owner",
        repo: "test-repo",
        stagedFiles: [
          {
            filePath: "src/file.ts",
            content: "new content",
            fileDeleted: false,
            initialFilePath: "src/file.ts",
            initialContent: "old content",
            parentCommitSha: "parent123",
          },
        ],
        branch: "main",
      }),
    ).rejects.toThrow("Internal Server Error");

    // Only one attempt — no retry on 500
    expect(createTreeSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 6: New file deletion becomes a no-op (parentCommitSha guard)
   * Input: A new file (parentCommitSha: null) marked as deleted
   * Verify: No Git writes are attempted (file never existed in repo)
   */
  it("Test 6: Deleting a new file (parentCommitSha null) does not create an empty commit", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    const createCommitSpy = vi
      .spyOn(octokit.rest.git, "createCommit")
      .mockResolvedValue(makeCreateCommitResponse("newtree123", "commit123"));
    const updateRefSpy = vi
      .spyOn(octokit.rest.git, "updateRef")
      .mockResolvedValue(makeUpdateRefResponse("commit123"));

    const result = await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/new-file.ts",
          content: "",
          fileDeleted: true,
          initialFilePath: "src/new-file.ts",
          initialContent: "",
          parentCommitSha: null, // Never committed to GitHub
        },
      ],
      branch: "main",
    });

    expect(result.sha).toBe("abc123");
    expect(result.url).toBe(
      "https://github.com/test-owner/test-repo/commit/abc123",
    );
    expect(createTreeSpy).not.toHaveBeenCalled();
    expect(createCommitSpy).not.toHaveBeenCalled();
    expect(updateRefSpy).not.toHaveBeenCalled();
  });

  /**
   * Test 7: Renaming a new file (parentCommitSha null) skips old-path deletion
   * Input: A new file renamed before first commit
   * Verify: Only the addition entry is created, no deletion of old path
   */
  it("Test 7: Renaming a new file skips old-path deletion", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/renamed-new.ts",
          content: "file content",
          fileDeleted: false,
          initialFilePath: "src/original-new.ts",
          initialContent: "",
          parentCommitSha: null, // New file, never committed
        },
      ],
      branch: "main",
    });

    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    // Only 1 entry: addition of new path, no deletion of old path
    expect(createTreeCall.tree.length).toBe(1);
    expect(createTreeCall.tree[0].path).toBe("src/renamed-new.ts");
    expect(readInlineContent(createTreeCall.tree[0])).toBe("file content");
  });

  /**
   * Test 8: No createBlob calls — content is inline in tree entries
   * Input: 3 modified files
   * Verify: createBlob is never called
   * Verify: tree entries use content field
   */
  it("Test 8: No createBlob calls - content is provided inline", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );
    const createBlobSpy = vi.spyOn(octokit.rest.git, "createBlob");
    const createTreeSpy = vi
      .spyOn(octokit.rest.git, "createTree")
      .mockResolvedValue(makeCreateTreeResponse("newtree123"));
    vi.spyOn(octokit.rest.git, "createCommit").mockResolvedValue(
      makeCreateCommitResponse("newtree123", "commit123"),
    );
    vi.spyOn(octokit.rest.git, "updateRef").mockResolvedValue(
      makeUpdateRefResponse("commit123"),
    );

    await createCommitWithMultipleFiles({
      octokit,
      owner: "test-owner",
      repo: "test-repo",
      stagedFiles: [
        {
          filePath: "src/file1.ts",
          content: "content 1",
          fileDeleted: false,
          initialFilePath: "src/file1.ts",
          initialContent: "old content 1",
          parentCommitSha: "parent1",
        },
        {
          filePath: "src/file2.ts",
          content: "content 2",
          fileDeleted: false,
          initialFilePath: "src/file2.ts",
          initialContent: "old content 2",
          parentCommitSha: "parent2",
        },
        {
          filePath: "src/file3.ts",
          content: "content 3",
          fileDeleted: false,
          initialFilePath: "src/file3.ts",
          initialContent: "old content 3",
          parentCommitSha: "parent3",
        },
      ],
      branch: "main",
    });

    // createBlob should never be called — content is inline
    expect(createBlobSpy).not.toHaveBeenCalled();

    // Verify tree entries have inline content
    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    expect(createTreeCall.tree.length).toBe(3);
    for (const entry of createTreeCall.tree) {
      if (!hasInlineContent(entry)) {
        throw new Error("Expected tree entry with inline content");
      }
      expect(entry.content).toBeDefined();
    }
  });
});
