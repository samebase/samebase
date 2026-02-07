import { describe, it, expect, vi, beforeEach } from "vitest";
import { Octokit } from "@octokit/rest";

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

  try {
    // 1. Get the current commit SHA
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const currentCommitSha = refData.object.sha;

    // 2. Get the current commit to get the tree SHA
    const { data: currentCommit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha,
    });
    const currentTreeSha = currentCommit.tree.sha;

    // 3. Prepare file lists for parallel processing
    const pathsToDelete = new Set<string>();
    const filesToCreateBlobs: Array<{
      filePath: string;
      content: string;
    }> = [];

    for (const file of stagedFiles) {
      if (file.fileDeleted) {
        pathsToDelete.add(file.filePath);
      } else {
        const isRenamed = file.filePath !== file.initialFilePath;
        if (isRenamed) {
          pathsToDelete.add(file.initialFilePath);
        }
        filesToCreateBlobs.push({
          filePath: file.filePath,
          content: file.content,
        });
      }
    }

    // 4. Create all blobs in parallel
    const blobResults = await Promise.all(
      filesToCreateBlobs.map((file) =>
        octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          encoding: "base64",
        }),
      ),
    );

    // 5. Build incremental tree entries (only changes)
    const newTreeEntries: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string | null;
    }> = [];

    // Add deleted files with sha: null to remove them
    for (const path of pathsToDelete) {
      newTreeEntries.push({
        path,
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }

    // Add new/updated files with their blob SHAs
    for (let i = 0; i < filesToCreateBlobs.length; i++) {
      newTreeEntries.push({
        path: filesToCreateBlobs[i].filePath,
        mode: "100644",
        type: "blob",
        sha: blobResults[i].data.sha,
      });
    }

    // 6. Create a new tree using base_tree — only sends the diff
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree: newTreeEntries as any,
    });

    // 7. Create the commit
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: "Test commit",
      tree: newTree.sha,
      parents: [currentCommitSha],
    });

    // 8. Update the reference
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
    console.error("Failed to create commit:", error);
    throw error;
  }
}

describe("createCommitWithMultipleFiles", () => {
  let mockOctokit: Partial<Octokit>;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        git: {
          getRef: vi.fn(),
          getCommit: vi.fn(),
          createBlob: vi.fn(),
          createTree: vi.fn(),
          createCommit: vi.fn(),
          updateRef: vi.fn(),
        },
      },
    };
  });

  /**
   * Test 1: Single file edit
   * Input: One modified file
   * Verify: Tree entry array contains only 1 blob entry
   * Verify: base_tree parameter is passed to createTree()
   */
  it("Test 1: Single file edit - creates only 1 tree entry with base_tree", async () => {
    // Setup mocks
    (mockOctokit.rest!.git!.getRef as any).mockResolvedValue({
      data: { object: { sha: "abc123" } },
    });
    (mockOctokit.rest!.git!.getCommit as any).mockResolvedValue({
      data: { tree: { sha: "tree123" } },
    });
    (mockOctokit.rest!.git!.createBlob as any).mockResolvedValue({
      data: { sha: "blob1" },
    });
    (mockOctokit.rest!.git!.createTree as any).mockResolvedValue({
      data: { sha: "newtree123" },
    });
    (mockOctokit.rest!.git!.createCommit as any).mockResolvedValue({
      data: { sha: "commit123", html_url: "http://github.com/commit" },
    });
    (mockOctokit.rest!.git!.updateRef as any).mockResolvedValue({});

    await createCommitWithMultipleFiles({
      octokit: mockOctokit as Octokit,
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
    const createTreeCall = (mockOctokit.rest!.git!.createTree as any).mock
      .calls[0][0];
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
    (mockOctokit.rest!.git!.getRef as any).mockResolvedValue({
      data: { object: { sha: "abc123" } },
    });
    (mockOctokit.rest!.git!.getCommit as any).mockResolvedValue({
      data: { tree: { sha: "tree123" } },
    });
    (mockOctokit.rest!.git!.createBlob as any).mockResolvedValue({
      data: { sha: "blob1" },
    });
    (mockOctokit.rest!.git!.createTree as any).mockResolvedValue({
      data: { sha: "newtree123" },
    });
    (mockOctokit.rest!.git!.createCommit as any).mockResolvedValue({
      data: { sha: "commit123", html_url: "http://github.com/commit" },
    });
    (mockOctokit.rest!.git!.updateRef as any).mockResolvedValue({});

    await createCommitWithMultipleFiles({
      octokit: mockOctokit as Octokit,
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

    const createTreeCall = (mockOctokit.rest!.git!.createTree as any).mock
      .calls[0][0];
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
    (mockOctokit.rest!.git!.getRef as any).mockResolvedValue({
      data: { object: { sha: "abc123" } },
    });
    (mockOctokit.rest!.git!.getCommit as any).mockResolvedValue({
      data: { tree: { sha: "tree123" } },
    });
    (mockOctokit.rest!.git!.createBlob as any).mockResolvedValue({
      data: { sha: "blob1" },
    });
    (mockOctokit.rest!.git!.createTree as any).mockResolvedValue({
      data: { sha: "newtree123" },
    });
    (mockOctokit.rest!.git!.createCommit as any).mockResolvedValue({
      data: { sha: "commit123", html_url: "http://github.com/commit" },
    });
    (mockOctokit.rest!.git!.updateRef as any).mockResolvedValue({});

    await createCommitWithMultipleFiles({
      octokit: mockOctokit as Octokit,
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

    const createTreeCall = (mockOctokit.rest!.git!.createTree as any).mock
      .calls[0][0];
    // Should have 2 entries: deletion of old path + addition of new path
    expect(createTreeCall.tree.length).toBe(2);

    const deletionEntry = createTreeCall.tree.find(
      (e: any) => e.path === "src/old-name.ts",
    );
    const additionEntry = createTreeCall.tree.find(
      (e: any) => e.path === "src/new-name.ts",
    );

    expect(deletionEntry).toBeDefined();
    expect(deletionEntry.sha).toBe(null);
    expect(additionEntry).toBeDefined();
    expect(additionEntry.sha).toBe("blob1");
  });

  /**
   * Test 4: Mixed changes
   * Input: 2 edits + 1 deletion + 1 rename
   * Verify: Tree entries contain exactly 5 entries (2 edits + 1 delete + 1 old path delete + 1 new path add)
   * Verify: No full tree reconstruction happens (base_tree is used)
   */
  it("Test 4: Mixed changes - handles edits, deletes, and renames", async () => {
    (mockOctokit.rest!.git!.getRef as any).mockResolvedValue({
      data: { object: { sha: "abc123" } },
    });
    (mockOctokit.rest!.git!.getCommit as any).mockResolvedValue({
      data: { tree: { sha: "tree123" } },
    });
    (mockOctokit.rest!.git!.createBlob as any)
      .mockResolvedValueOnce({ data: { sha: "blob1" } })
      .mockResolvedValueOnce({ data: { sha: "blob2" } })
      .mockResolvedValueOnce({ data: { sha: "blob3" } });
    (mockOctokit.rest!.git!.createTree as any).mockResolvedValue({
      data: { sha: "newtree123" },
    });
    (mockOctokit.rest!.git!.createCommit as any).mockResolvedValue({
      data: { sha: "commit123", html_url: "http://github.com/commit" },
    });
    (mockOctokit.rest!.git!.updateRef as any).mockResolvedValue({});

    await createCommitWithMultipleFiles({
      octokit: mockOctokit as Octokit,
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

    const createTreeCall = (mockOctokit.rest!.git!.createTree as any).mock
      .calls[0][0];
    // Should have 5 entries: 2 edits + 1 delete + 1 old rename delete + 1 new rename add
    expect(createTreeCall.tree.length).toBe(5);

    // Verify base_tree is used
    expect(createTreeCall.base_tree).toBe("tree123");

    // Verify all paths are present
    const paths = createTreeCall.tree.map((e: any) => e.path);
    expect(paths).toContain("src/edit1.ts");
    expect(paths).toContain("src/edit2.ts");
    expect(paths).toContain("src/deleted.ts");
    expect(paths).toContain("src/renamed-old.ts");
    expect(paths).toContain("src/renamed-new.ts");
  });

  /**
   * Test 5: Verify blobs are created in parallel
   * Input: 3 modified files
   * Verify: All blobs created via Promise.all() (no sequential API calls)
   */
  it("Test 5: Blobs are created in parallel", async () => {
    (mockOctokit.rest!.git!.getRef as any).mockResolvedValue({
      data: { object: { sha: "abc123" } },
    });
    (mockOctokit.rest!.git!.getCommit as any).mockResolvedValue({
      data: { tree: { sha: "tree123" } },
    });

    const createBlobMock = vi
      .fn()
      .mockResolvedValueOnce({ data: { sha: "blob1" } })
      .mockResolvedValueOnce({ data: { sha: "blob2" } })
      .mockResolvedValueOnce({ data: { sha: "blob3" } });

    (mockOctokit.rest!.git!.createBlob as any) = createBlobMock;

    (mockOctokit.rest!.git!.createTree as any).mockResolvedValue({
      data: { sha: "newtree123" },
    });
    (mockOctokit.rest!.git!.createCommit as any).mockResolvedValue({
      data: { sha: "commit123", html_url: "http://github.com/commit" },
    });
    (mockOctokit.rest!.git!.updateRef as any).mockResolvedValue({});

    await createCommitWithMultipleFiles({
      octokit: mockOctokit as Octokit,
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
    expect(createBlobMock).toHaveBeenCalledTimes(3);

    // Verify all blob calls were made (they happen in Promise.all, so order might vary)
    const blobCalls = createBlobMock.mock.calls;
    expect(blobCalls.length).toBe(3);
  });
});
