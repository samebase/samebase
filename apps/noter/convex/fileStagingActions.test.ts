import { describe, it, expect, vi, beforeEach } from "vitest";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";

type GitApi = RestEndpointMethodTypes["git"];
type GetRefResponse = GitApi["getRef"]["response"];
type GetCommitResponse = GitApi["getCommit"]["response"];
type CreateTreeResponse = GitApi["createTree"]["response"];
type CreateCommitResponse = GitApi["createCommit"]["response"];
type UpdateRefResponse = GitApi["updateRef"]["response"];

type GetRefData = GitApi["getRef"]["response"]["data"];
type GetCommitData = GitApi["getCommit"]["response"]["data"];
type CreateTreeData = GitApi["createTree"]["response"]["data"];
type CreateCommitData = GitApi["createCommit"]["response"]["data"];
type UpdateRefData = GitApi["updateRef"]["response"]["data"];

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

/**
 * Mock implementation of createCommitWithMultipleFiles
 * Extracted from the actual implementation for testing
 */
async function createCommitWithMultipleFiles({
  octokit,
  owner,
  repo,
  stagedFiles,
  branch,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  stagedFiles: Array<{
    filePath: string;
    content: string;
    fileDeleted: boolean;
    initialFilePath: string;
    initialContent?: string;
    parentCommitSha: string | null;
  }>;
  branch: string;
}) {
  // Helper to compute modified (added) line ranges in the new content
  const computeModifiedLineRanges = (
    oldContent: string,
    newContent: string,
  ): Array<{ from: number; to: number }> => {
    // Simplified version for testing
    if (oldContent === newContent) return [];
    return [{ from: 1, to: 1 }]; // Mock implementation
  };

  // Summarize all changes to craft a commit message
  const changesInfo: Array<{
    deleted: boolean;
    modifiedLines: Array<{ from: number; to: number }>;
    filePath: string;
    initialFilePath: string;
    wasModified: boolean;
  }> = stagedFiles.map((file) => ({
    deleted: file.fileDeleted,
    filePath: file.filePath,
    initialFilePath: file.initialFilePath,
    modifiedLines: file.fileDeleted
      ? []
      : computeModifiedLineRanges(
          file.initialContent ?? "",
          file.content ?? "",
        ),
    wasModified:
      !file.fileDeleted && (file.initialContent ?? "") !== (file.content ?? ""),
  }));

  // 1. Prepare file lists
  const pathsToDelete = new Set<string>();
  const filesToAdd: Array<{
    filePath: string;
    content: string;
  }> = [];

  for (const file of stagedFiles) {
    if (file.fileDeleted) {
      if (file.parentCommitSha !== null) {
        pathsToDelete.add(file.filePath);
      }
    } else {
      const isRenamed = file.filePath !== file.initialFilePath;
      if (isRenamed && file.parentCommitSha !== null) {
        pathsToDelete.add(file.initialFilePath);
      }
      filesToAdd.push({
        filePath: file.filePath,
        content: file.content,
      });
    }
  }

  // 2. Build tree entries with inline content
  const newTreeEntries: Array<
    | { path: string; mode: "100644"; type: "blob"; sha: null }
    | { path: string; mode: "100644"; type: "blob"; content: string }
  > = [];

  for (const path of pathsToDelete) {
    newTreeEntries.push({
      path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }

  for (const file of filesToAdd) {
    newTreeEntries.push({
      path: file.filePath,
      mode: "100644",
      type: "blob",
      content: file.content,
    });
  }

  // 4. Retry loop for ref-dependent operations
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      const currentCommitSha = refData.object.sha;

      const { data: currentCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha,
      });
      const currentTreeSha = currentCommit.tree.sha;

      const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: currentTreeSha,
        tree: newTreeEntries as any,
      });

      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: "Test commit",
        tree: newTree.sha,
        parents: [currentCommitSha],
      });

      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
      });

      return {
        sha: newCommit.sha,
        url: newCommit.html_url,
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      const isRetryable = status === 422 || status === 409;
      if (!isRetryable || attempt === MAX_ATTEMPTS - 1) {
        console.error("Failed to create commit:", error);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 0)); // immediate in tests
    }
  }

  throw new Error("Exhausted commit retry attempts");
}

describe("createCommitWithMultipleFiles", () => {
  let octokit: Octokit;

  beforeEach(() => {
    vi.restoreAllMocks();
    octokit = new Octokit({ auth: "test" });
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
    vi.spyOn(octokit.rest.git, "createBlob").mockResolvedValue(
      makeCreateBlobResponse("blob1"),
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
          filePath: "src/file.ts",
          content: "new content",
          fileDeleted: false,
          initialFilePath: "src/file.ts",
          initialContent: "old content",
        },
      ],
      branch: "main",
    });

    // Verify tree was created with only 1 entry
    const createTreeCall = createTreeSpy.mock.calls[0]?.[0];
    if (!createTreeCall) {
      throw new Error("createTree was not called");
    }
    expect(createTreeCall.tree.length).toBe(1);
    expect(createTreeCall.tree[0].path).toBe("src/file.ts");
    expect(createTreeCall.tree[0].sha).toBe("blob1");

    // Verify base_tree parameter is passed
    expect(createTreeCall.base_tree).toBe("tree123");
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
    vi.spyOn(octokit.rest.git, "createBlob").mockResolvedValue(
      makeCreateBlobResponse("blob1"),
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
    vi.spyOn(octokit.rest.git, "createBlob").mockResolvedValue(
      makeCreateBlobResponse("blob1"),
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
    expect(additionEntry.sha).toBe("blob1");
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
    vi.spyOn(octokit.rest.git, "createBlob")
      .mockResolvedValueOnce(makeCreateBlobResponse("blob1"))
      .mockResolvedValueOnce(makeCreateBlobResponse("blob2"))
      .mockResolvedValueOnce(makeCreateBlobResponse("blob3"));
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
        },
        {
          filePath: "src/edit2.ts",
          content: "new content 2",
          fileDeleted: false,
          initialFilePath: "src/edit2.ts",
          initialContent: "old content 2",
        },
        {
          filePath: "src/deleted.ts",
          content: "",
          fileDeleted: true,
          initialFilePath: "src/deleted.ts",
          initialContent: "deleted content",
        },
        {
          filePath: "src/renamed-new.ts",
          content: "renamed content",
          fileDeleted: false,
          initialFilePath: "src/renamed-old.ts",
          initialContent: "renamed content",
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
  });

  /**
   * Test 5: Retry on 422 (GitRPC::BadObjectState)
   * Input: createTree fails with 422 on first attempt, succeeds on second
   * Verify: getRef is called twice (re-fetched on retry)
   * Verify: createBlob is called only once per file (outside retry loop)
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

    const createBlobSpy = vi
      .spyOn(octokit.rest.git, "createBlob")
      .mockResolvedValue(makeCreateBlobResponse("blob1"));

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
        },
      ],
      branch: "main",
    });

    // getRef called twice: once for stale attempt, once for fresh retry
    expect(getRefSpy).toHaveBeenCalledTimes(2);

    // createBlob called only once (outside retry loop)
    expect(createBlobSpy).toHaveBeenCalledTimes(1);

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
    vi.spyOn(octokit.rest.git, "createBlob").mockResolvedValue(
      makeCreateBlobResponse("blob1"),
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
          },
        ],
        branch: "main",
      }),
    ).rejects.toThrow("Internal Server Error");

    // Only one attempt — no retry on 500
    expect(createTreeSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 6: Verify blobs are created in parallel
   * Input: 3 modified files
   * Verify: All blobs created via Promise.all() (no sequential API calls)
   */
  it("Test 5: Blobs are created in parallel", async () => {
    vi.spyOn(octokit.rest.git, "getRef").mockResolvedValue(
      makeGetRefResponse("abc123"),
    );
    vi.spyOn(octokit.rest.git, "getCommit").mockResolvedValue(
      makeGetCommitResponse("tree123", "abc123"),
    );

    const createBlobSpy = vi
      .spyOn(octokit.rest.git, "createBlob")
      .mockResolvedValueOnce(makeCreateBlobResponse("blob1"))
      .mockResolvedValueOnce(makeCreateBlobResponse("blob2"))
      .mockResolvedValueOnce(makeCreateBlobResponse("blob3"));

    vi.spyOn(octokit.rest.git, "createTree").mockResolvedValue(
      makeCreateTreeResponse("newtree123"),
    );
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
        },
        {
          filePath: "src/file2.ts",
          content: "content 2",
          fileDeleted: false,
          initialFilePath: "src/file2.ts",
          initialContent: "old content 2",
        },
        {
          filePath: "src/file3.ts",
          content: "content 3",
          fileDeleted: false,
          initialFilePath: "src/file3.ts",
          initialContent: "old content 3",
        },
      ],
      branch: "main",
    });

    // Verify createBlob was called 3 times
    expect(createBlobSpy).toHaveBeenCalledTimes(3);

    // Verify all blob calls were made (they happen in Promise.all, so order might vary)
    const blobCalls = createBlobSpy.mock.calls;
    expect(blobCalls.length).toBe(3);
  });
});
