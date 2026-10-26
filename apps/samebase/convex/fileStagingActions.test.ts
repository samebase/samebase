import { describe, it, expect, vi } from "vite-plus/test";
import {
  buildDraftBranchName,
  stripCreationTimeFromStagingRecord,
  getDraftPullRequestCreateErrorMessage,
  shouldAdvanceBinaryPullParentCommit,
} from "@samebase/git-editor/operations";
import {
  buildDraftPullRequestTitle,
  readOpenPullRequestForBranch,
} from "@samebase/git-editor/pullRequests";
import {
  buildCommitPreviewFromStagedFiles,
  buildComparedCommitPreviewFileFromStagedFile,
  buildRemoteComparePreviewFile,
} from "@samebase/git-editor/previews";

describe("draft pull request helpers", () => {
  it("matches the current branch pull request in the same repository", () => {
    expect(
      readOpenPullRequestForBranch({
        branch: "feature-branch",
        baseBranch: "main",
        githubRepositoryFullName: "test-owner/test-repo",
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
      baseBranch: "main",
    });
  });

  it("ignores an open pull request that targets a different base branch", () => {
    expect(
      readOpenPullRequestForBranch({
        branch: "feature-branch",
        baseBranch: "main",
        githubRepositoryFullName: "test-owner/test-repo",
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

  it("keeps the latest updated pull request among matching default-base PRs", () => {
    expect(
      readOpenPullRequestForBranch({
        branch: "feature-branch",
        baseBranch: "main",
        githubRepositoryFullName: "test-owner/test-repo",
        pullRequests: [
          {
            number: 41,
            html_url: "https://github.com/test-owner/test-repo/pull/41",
            updated_at: "2026-03-21T10:00:00Z",
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
            number: 42,
            html_url: "https://github.com/test-owner/test-repo/pull/42",
            created_at: "2026-03-22T10:00:00Z",
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
            html_url: "https://github.com/test-owner/test-repo/pull/43",
            updated_at: "2026-03-23T10:00:00Z",
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
    ).toEqual({
      url: "https://github.com/test-owner/test-repo/pull/42",
      number: 42,
      baseBranch: "main",
    });
  });

  it("uses the higher PR number when activity timestamps match", () => {
    const pullRequests = [43, 42].map((number) => ({
      number,
      html_url: `https://github.com/test-owner/test-repo/pull/${number}`,
      updated_at: "2026-03-22T10:00:00Z",
      base: { ref: "main" },
      head: { ref: "feature-branch", repo: { full_name: "test-owner/test-repo" } },
    }));
    expect(
      readOpenPullRequestForBranch({
        branch: "feature-branch",
        githubRepositoryFullName: "test-owner/test-repo",
        pullRequests,
      }),
    ).toEqual({
      url: "https://github.com/test-owner/test-repo/pull/43",
      number: 43,
      baseBranch: "main",
    });
  });

  it("uses the latest commit subject for the draft PR title", () => {
    expect(
      buildDraftPullRequestTitle({
        branch: "feature-branch",
        commitMessage: "Add draft PR button\n\nExtra details",
      }),
    ).toBe("Add draft PR button");
  });

  it("builds a readable draft branch name from staged files", () => {
    expect(
      buildDraftBranchName({
        stagedFiles: [
          {
            filePath: "docs/Draft Button.md",
            initialFilePath: "docs/Draft Button.md",
          },
          {
            filePath: "src/FileView.tsx",
            initialFilePath: "src/FileView.tsx",
          },
        ],
        now: 1_712_345_678_901,
      }),
    ).toBe("draft/draft-button-md-fileview-tsx-lun2elv9");
  });

  it("preserves binary staging metadata when default-branch staging is forked", () => {
    const record = {
      _id: "file-staging-1",
      _creationTime: 1_712_345_678_901,
      repositoryId: "repository-1",
      fileDeleted: false,
      kind: "binary" as const,
      filePath: "public/images/hero.png",
      initialFilePath: "public/images/hero.png",
      content: "",
      initialContent: "",
      storageId: "storage-1",
      mime: "image/png",
      size: 1024,
      stagedBlobSha: "blob-sha-1",
      parentCommitSha: null,
      branch: "main",
      lastEditTime: 1_712_345_678_902,
      lastEditUserId: "user-1",
      version: 0,
    };

    expect(stripCreationTimeFromStagingRecord(record)).toEqual({
      _id: "file-staging-1",
      repositoryId: "repository-1",
      fileDeleted: false,
      kind: "binary",
      filePath: "public/images/hero.png",
      initialFilePath: "public/images/hero.png",
      content: "",
      initialContent: "",
      storageId: "storage-1",
      mime: "image/png",
      size: 1024,
      stagedBlobSha: "blob-sha-1",
      parentCommitSha: null,
      branch: "main",
      lastEditTime: 1_712_345_678_902,
      lastEditUserId: "user-1",
      version: 0,
    });
  });

  it("returns a friendly message when the branch has no PR-worthy commits", () => {
    expect(
      getDraftPullRequestCreateErrorMessage({
        message: "Validation Failed: No commits between main and feature-branch",
      }),
    ).toBe("This branch has no changes to open as a pull request.");
  });

  it("keeps the latest open pull request for compare mode even when the base branch differs", () => {
    expect(
      readOpenPullRequestForBranch({
        branch: "feature-branch",
        githubRepositoryFullName: "test-owner/test-repo",
        pullRequests: [
          {
            number: 41,
            html_url: "https://github.com/test-owner/test-repo/pull/41",
            updated_at: "2026-03-21T10:00:00Z",
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
            html_url: "https://github.com/test-owner/test-repo/pull/43",
            updated_at: "2026-03-23T10:00:00Z",
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
    ).toEqual({
      url: "https://github.com/test-owner/test-repo/pull/43",
      number: 43,
      baseBranch: "release/1.2",
    });
  });
});

describe("buildComparedCommitPreviewFileFromStagedFile", () => {
  it("drops a locally deleted file that only exists because the PR added it", () => {
    expect(
      buildComparedCommitPreviewFileFromStagedFile({
        stagedFile: {
          filePath: "src/new.ts",
          initialFilePath: "src/new.ts",
          content: "console.log('new');\n",
          initialContent: "console.log('new');\n",
          fileDeleted: true,
          parentCommitSha: "head-sha",
          branch: "feature",
        },
        matchedRemoteFile: {
          status: "added",
          path: "src/new.ts",
        },
        basePath: null,
        baseContent: "",
        includePatch: true,
      }),
    ).toBeNull();
  });

  it("keeps a locally renamed PR-added file as added at the new path", () => {
    expect(
      buildComparedCommitPreviewFileFromStagedFile({
        stagedFile: {
          filePath: "src/better-name.ts",
          initialFilePath: "src/new.ts",
          content: "console.log('new');\n",
          initialContent: "console.log('new');\n",
          fileDeleted: false,
          parentCommitSha: "head-sha",
          branch: "feature",
        },
        matchedRemoteFile: {
          status: "added",
          path: "src/new.ts",
        },
        basePath: null,
        baseContent: "",
        includePatch: true,
      }),
    ).toEqual(
      expect.objectContaining({
        status: "added",
        path: "src/better-name.ts",
        previousPath: undefined,
      }),
    );
  });

  it("drops a restored deleted file when staging matches the PR base content", () => {
    expect(
      buildComparedCommitPreviewFileFromStagedFile({
        stagedFile: {
          filePath: "docs/guide.md",
          initialFilePath: "docs/guide.md",
          content: "# Guide\n",
          initialContent: "",
          fileDeleted: false,
          parentCommitSha: null,
          branch: "feature",
        },
        matchedRemoteFile: {
          status: "deleted",
          path: "docs/guide.md",
        },
        basePath: "docs/guide.md",
        baseContent: "# Guide\n",
        includePatch: true,
      }),
    ).toBeNull();
  });

  it("preserves the original base path for a renamed file with additional staged edits", () => {
    expect(
      buildComparedCommitPreviewFileFromStagedFile({
        stagedFile: {
          filePath: "src/file-new.ts",
          initialFilePath: "src/file-new.ts",
          content: "export const value = 2;\n",
          initialContent: "export const value = 1;\n",
          fileDeleted: false,
          parentCommitSha: "head-sha",
          branch: "feature",
        },
        matchedRemoteFile: {
          status: "renamed",
          path: "src/file-new.ts",
          previousPath: "src/file-old.ts",
        },
        basePath: "src/file-old.ts",
        baseContent: "export const value = 1;\n",
        includePatch: true,
      }),
    ).toEqual(
      expect.objectContaining({
        status: "renamed",
        path: "src/file-new.ts",
        previousPath: "src/file-old.ts",
      }),
    );
  });

  it("hydrates rich text content for non-markdown staged compare overlays", () => {
    expect(
      buildComparedCommitPreviewFileFromStagedFile({
        stagedFile: {
          filePath: "src/file.ts",
          initialFilePath: "src/file.ts",
          content: "export const value = 2;\n",
          initialContent: "export const value = 1;\n",
          fileDeleted: false,
          parentCommitSha: "head-sha",
          branch: "feature",
        },
        matchedRemoteFile: {
          status: "modified",
          path: "src/file.ts",
        },
        basePath: "src/file.ts",
        baseContent: "export const value = 1;\n",
        includePatch: true,
      }),
    ).toEqual(
      expect.objectContaining({
        status: "modified",
        path: "src/file.ts",
        richOldContent: "export const value = 1;\n",
        richNewContent: "export const value = 2;\n",
      }),
    );
  });

  it("reports renamed-file deletes against the base path", () => {
    expect(
      buildComparedCommitPreviewFileFromStagedFile({
        stagedFile: {
          filePath: "src/file-new.ts",
          initialFilePath: "src/file-new.ts",
          content: "export const value = 1;\n",
          initialContent: "export const value = 1;\n",
          fileDeleted: true,
          parentCommitSha: "head-sha",
          branch: "feature",
        },
        matchedRemoteFile: {
          status: "renamed",
          path: "src/file-new.ts",
          previousPath: "src/file-old.ts",
        },
        basePath: "src/file-old.ts",
        baseContent: "export const value = 1;\n",
        includePatch: true,
      }),
    ).toEqual(
      expect.objectContaining({
        status: "deleted",
        path: "src/file-old.ts",
        richOldContent: "export const value = 1;\n",
        richNewContent: "",
      }),
    );
  });
});

describe("buildCommitPreviewFromStagedFiles", () => {
  it("hydrates rich text content for non-markdown staged files", () => {
    const preview = buildCommitPreviewFromStagedFiles({
      branch: "feature",
      includePatch: true,
      stagedFiles: [
        {
          filePath: "src/file.ts",
          initialFilePath: "src/file.ts",
          content: "export const value = 2;\n",
          initialContent: "export const value = 1;\n",
          fileDeleted: false,
          parentCommitSha: "head-sha",
          branch: "feature",
        },
      ],
    });

    expect(preview.files).toEqual([
      expect.objectContaining({
        status: "modified",
        path: "src/file.ts",
        richOldContent: "export const value = 1;\n",
        richNewContent: "export const value = 2;\n",
      }),
    ]);
  });

  it("shows a deleted renamed file at the path the commit deletes", () => {
    const preview = buildCommitPreviewFromStagedFiles({
      branch: "feature",
      includePatch: false,
      stagedFiles: [
        {
          filePath: "b.md",
          initialFilePath: "a.md",
          content: "text\n",
          initialContent: "text\n",
          fileDeleted: true,
          parentCommitSha: "head-sha",
          branch: "feature",
        },
      ],
    });

    expect(preview.files).toEqual([
      expect.objectContaining({ status: "deleted", path: "a.md", previousPath: undefined }),
    ]);
  });
});

describe("buildRemoteComparePreviewFile", () => {
  it("hydrates markdown compare files with rich content from base and head trees", async () => {
    const encoder = new TextEncoder();
    const getBlobBufferBySha = vi.fn(async (sha: string) => {
      if (sha === "base-sha") {
        return encoder.encode("# Spec\n\nOld line\n");
      }

      if (sha === "head-sha") {
        return encoder.encode("# Spec\n\nNew line\n");
      }

      throw new Error(`Unexpected sha ${sha}`);
    });

    const result = await buildRemoteComparePreviewFile({
      file: {
        filename: "rfcs/spec.md",
        status: "modified",
        additions: 1,
        deletions: 1,
        patch: "@@ -1,3 +1,3 @@",
      },
      baseShaByPath: new Map([["rfcs/spec.md", "base-sha"]]),
      headShaByPath: new Map([["rfcs/spec.md", "head-sha"]]),
      getBlobBufferBySha,
      includePatch: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "modified",
        path: "rfcs/spec.md",
        isMarkdown: true,
        richOldContent: "# Spec\n\nOld line\n",
        richNewContent: "# Spec\n\nNew line\n",
      }),
    );
    expect(result?.patch).toContain("--- rfcs/spec.md");
    expect(getBlobBufferBySha).toHaveBeenCalledTimes(2);
  });

  it("hydrates added markdown compare files from the head tree", async () => {
    const encoder = new TextEncoder();
    const getBlobBufferBySha = vi.fn(async (sha: string) => {
      if (sha === "head-sha") {
        return encoder.encode("# New spec\n\nAdded line\n");
      }

      throw new Error(`Unexpected sha ${sha}`);
    });

    const result = await buildRemoteComparePreviewFile({
      file: {
        filename: "rfcs/spec.md",
        status: "added",
        additions: 3,
        deletions: 0,
        patch: "@@ -0,0 +1,3 @@",
      },
      baseShaByPath: new Map(),
      headShaByPath: new Map([["rfcs/spec.md", "head-sha"]]),
      getBlobBufferBySha,
      includePatch: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "added",
        path: "rfcs/spec.md",
        isMarkdown: true,
        richOldContent: "",
        richNewContent: "# New spec\n\nAdded line\n",
        oldLineCount: 0,
        newLineCount: 4,
      }),
    );
    expect(result?.patch).toContain("+++ rfcs/spec.md");
    expect(getBlobBufferBySha).toHaveBeenCalledTimes(1);
  });

  it("hydrates text compare files from the base and head trees", async () => {
    const encoder = new TextEncoder();
    const getBlobBufferBySha = vi.fn(async (sha: string) => {
      if (sha === "base-sha") {
        return encoder.encode("export const flag = false;\n");
      }
      if (sha === "head-sha") {
        return encoder.encode("export const flag = true;\nexport const compare = true;\n");
      }

      throw new Error(`Unexpected sha ${sha}`);
    });

    const result = await buildRemoteComparePreviewFile({
      file: {
        filename: "src/file.ts",
        status: "modified",
        additions: 3,
        deletions: 2,
        patch: "@@ -1 +1 @@",
      },
      baseShaByPath: new Map([["src/file.ts", "base-sha"]]),
      headShaByPath: new Map([["src/file.ts", "head-sha"]]),
      getBlobBufferBySha,
      includePatch: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "modified",
        path: "src/file.ts",
        isMarkdown: false,
        richOldContent: "export const flag = false;\n",
        richNewContent: "export const flag = true;\nexport const compare = true;\n",
        oldLineCount: 2,
        newLineCount: 3,
      }),
    );
    expect(result?.patch).toContain("--- src/file.ts");
    expect(getBlobBufferBySha).toHaveBeenCalledTimes(2);
  });

  it("keeps binary compare files as patch-only metadata", async () => {
    const getBlobBufferBySha = vi.fn(async (sha: string) => {
      if (sha === "base-sha") {
        return new Uint8Array([0, 255, 0, 255]);
      }
      if (sha === "head-sha") {
        return new Uint8Array([255, 0, 255, 0]);
      }

      throw new Error(`Unexpected sha ${sha}`);
    });

    const result = await buildRemoteComparePreviewFile({
      file: {
        filename: "public/image.png",
        status: "modified",
        additions: 3,
        deletions: 2,
        patch: "@@ -1 +1 @@",
      },
      baseShaByPath: new Map([["public/image.png", "base-sha"]]),
      headShaByPath: new Map([["public/image.png", "head-sha"]]),
      getBlobBufferBySha,
      includePatch: true,
    });

    expect(result).toEqual({
      status: "modified",
      path: "public/image.png",
      previousPath: undefined,
      isBinary: false,
      mimeType: undefined,
      additions: 3,
      deletions: 2,
      oldLineCount: 0,
      newLineCount: 0,
      isMarkdown: false,
      patchTruncated: false,
      patch: "@@ -1 +1 @@",
    });
    expect(getBlobBufferBySha).toHaveBeenCalledTimes(2);
  });

  it("omits raw patch metadata when includePatch is false", async () => {
    const encoder = new TextEncoder();
    const getBlobBufferBySha = vi.fn(async (sha: string) => {
      if (sha === "base-sha") {
        return encoder.encode("export const flag = false;\n");
      }
      if (sha === "head-sha") {
        return encoder.encode("export const flag = true;\n");
      }

      throw new Error(`Unexpected sha ${sha}`);
    });

    const result = await buildRemoteComparePreviewFile({
      file: {
        filename: "src/file.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        patch: "@@ -1 +1 @@",
      },
      baseShaByPath: new Map([["src/file.ts", "base-sha"]]),
      headShaByPath: new Map([["src/file.ts", "head-sha"]]),
      getBlobBufferBySha,
      includePatch: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        path: "src/file.ts",
        richOldContent: "export const flag = false;\n",
        richNewContent: "export const flag = true;\n",
        patch: undefined,
      }),
    );
  });
});

describe("shouldAdvanceBinaryPullParentCommit", () => {
  it("advances when the staged binary already matches upstream", () => {
    expect(
      shouldAdvanceBinaryPullParentCommit({
        stagedBlobSha: "upstream-sha",
        upstreamSha: "upstream-sha",
      }),
    ).toBe(true);
  });

  it("preserves the previous base when upstream diverges", () => {
    expect(
      shouldAdvanceBinaryPullParentCommit({
        stagedBlobSha: "staged-sha",
        upstreamSha: "upstream-sha",
      }),
    ).toBe(false);
  });

  it("preserves the previous base when the staged row has no uploaded blob", () => {
    expect(
      shouldAdvanceBinaryPullParentCommit({
        stagedBlobSha: undefined,
        upstreamSha: "upstream-sha",
      }),
    ).toBe(false);
  });

  it("preserves the previous base for deleted binary rows even when the blob matches upstream", () => {
    expect(
      shouldAdvanceBinaryPullParentCommit({
        stagedBlobSha: "upstream-sha",
        fileDeleted: true,
        upstreamSha: "upstream-sha",
      }),
    ).toBe(false);
  });
});
