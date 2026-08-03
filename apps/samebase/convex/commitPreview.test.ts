import { describe, expect, it } from "vite-plus/test";
import {
  buildCommitPreviewFromStagedFiles,
  buildRebaseConflictPreviewFromStagedFiles,
} from "./fileStagingActions";

type BuildCommitPreviewArgs = Parameters<typeof buildCommitPreviewFromStagedFiles>[0];
type StagedFileForCommitPreview = BuildCommitPreviewArgs["stagedFiles"][number];

function makeStagedFile(
  overrides: Partial<StagedFileForCommitPreview> = {},
): StagedFileForCommitPreview {
  return {
    kind: "text",
    filePath: "README.md",
    initialFilePath: "README.md",
    content: "updated",
    initialContent: "initial",
    fileDeleted: false,
    parentCommitSha: "parent-sha",
    branch: "main",
    ...overrides,
  };
}

describe("buildCommitPreviewFromStagedFiles", () => {
  it("builds deterministic status/totals/safety metadata", () => {
    const preview = buildCommitPreviewFromStagedFiles({
      stagedFiles: [
        makeStagedFile({
          filePath: "added.md",
          initialFilePath: "added.md",
          parentCommitSha: null,
          initialContent: "",
          content: "new content",
        }),
        makeStagedFile({
          filePath: "changed.md",
          initialFilePath: "changed.md",
          parentCommitSha: "sha1",
          initialContent: "old",
          content: "new",
        }),
        makeStagedFile({
          filePath: "deleted.md",
          initialFilePath: "deleted.md",
          fileDeleted: true,
          parentCommitSha: "sha2",
          initialContent: "gone",
          content: "",
        }),
        makeStagedFile({
          filePath: "renamed-new.md",
          initialFilePath: "renamed-old.md",
          parentCommitSha: "sha3",
          initialContent: "same",
          content: "same",
        }),
      ],
      branch: "main",
      includePatch: true,
    });

    expect(preview.branch).toBe("main");
    expect(preview.totals.files).toBe(4);
    expect(preview.totals.added).toBe(1);
    expect(preview.totals.modified).toBe(1);
    expect(preview.totals.deleted).toBe(1);
    expect(preview.totals.renamed).toBe(1);
    expect(preview.hasDestructiveChanges).toBe(true);
    expect(preview.safety.destructiveFileCount).toBe(1);

    const added = preview.files.find((file) => file.path === "added.md");
    const renamed = preview.files.find((file) => file.path === "renamed-new.md");

    expect(added?.status).toBe("added");
    expect(added?.isMarkdown).toBe(true);
    expect(added?.richOldContent).toBe("");
    expect(added?.richNewContent).toBe("new content");
    expect(added?.richContentTruncated).toBe(false);
    expect(renamed?.status).toBe("renamed");
    expect(renamed?.previousPath).toBe("renamed-old.md");
    expect(renamed?.patch).toBeUndefined();
  });

  it("marks single-file patch truncation when per-file limit is exceeded", () => {
    const largeContent = Array.from({ length: 5000 }, (_, index) => `line-${index}`).join("\n");

    const preview = buildCommitPreviewFromStagedFiles({
      stagedFiles: [
        makeStagedFile({
          filePath: "huge.md",
          initialFilePath: "huge.md",
          initialContent: "",
          content: largeContent,
        }),
      ],
      branch: "main",
      includePatch: true,
    });

    expect(preview.safety.includesTruncatedPatches).toBe(true);
    expect(preview.safety.truncatedPatchFileCount).toBe(1);
    expect(preview.files[0]?.patchTruncated).toBe(true);
    expect(preview.files[0]?.patch).toContain("[patch truncated]");
    expect(preview.files[0]?.richContentTruncated).toBe(true);
    expect(preview.files[0]?.richNewContent).toContain("[content truncated for rich preview]");
  });

  it("truncates across many files when total patch budget is exceeded", () => {
    const mediumPatch = Array.from({ length: 500 }, (_, index) => `line-${index}`).join("\n");

    const stagedFiles = Array.from({ length: 60 }, (_, index) =>
      makeStagedFile({
        filePath: `docs/file-${index}.md`,
        initialFilePath: `docs/file-${index}.md`,
        initialContent: "",
        content: mediumPatch,
      }),
    );

    const preview = buildCommitPreviewFromStagedFiles({
      stagedFiles,
      branch: "main",
      includePatch: true,
    });

    expect(preview.files[0]?.patchTruncated).toBe(false);
    expect(preview.files.some((file) => file.patchTruncated)).toBe(true);
    expect(preview.safety.truncatedPatchFileCount).toBeGreaterThan(0);
    expect(preview.safety.includesTruncatedPatches).toBe(true);
  });

  it("skips patch generation when includePatch is false", () => {
    const preview = buildCommitPreviewFromStagedFiles({
      stagedFiles: [
        makeStagedFile({
          filePath: "no-patch.md",
          initialFilePath: "no-patch.md",
          initialContent: "old",
          content: "new",
        }),
      ],
      branch: "main",
      includePatch: false,
    });

    expect(preview.files[0]?.patch).toBeUndefined();
    expect(preview.files[0]?.patchTruncated).toBe(false);
    expect(preview.safety.includesTruncatedPatches).toBe(false);
    expect(preview.safety.truncatedPatchFileCount).toBe(0);
  });

  it("hydrates rich preview fields for non-markdown staged files", () => {
    const preview = buildCommitPreviewFromStagedFiles({
      stagedFiles: [
        makeStagedFile({
          filePath: "src/index.ts",
          initialFilePath: "src/index.ts",
          initialContent: "const n = 1;\n",
          content: "const n = 2;\n",
        }),
      ],
      branch: "main",
      includePatch: true,
    });

    expect(preview.files[0]?.isMarkdown).toBe(false);
    expect(preview.files[0]?.richOldContent).toBe("const n = 1;\n");
    expect(preview.files[0]?.richNewContent).toBe("const n = 2;\n");
    expect(preview.files[0]?.richContentTruncated).toBe(false);
  });
});

describe("buildRebaseConflictPreviewFromStagedFiles", () => {
  it("builds rebase conflict preview payloads with base and upstream patches", () => {
    const preview = buildRebaseConflictPreviewFromStagedFiles({
      branch: "main",
      conflicts: [
        {
          kind: "text",
          filePath: "TODO.md",
          initialFilePath: "TODO.md",
          content: ["alpha", "ours", ""].join("\n"),
          initialContent: ["alpha", "base", ""].join("\n"),
          upstreamContent: ["alpha", "theirs", ""].join("\n"),
          upstreamSha: "upstream-sha",
          fileDeleted: false,
          parentCommitSha: "base-sha",
          branch: "main",
        },
      ],
    });

    expect(preview.branch).toBe("main");
    expect(preview.files).toHaveLength(1);
    expect(preview.files[0]).toMatchObject({
      path: "TODO.md",
      isMarkdown: true,
      baseBlobSha: "base-sha",
      upstreamBlobSha: "upstream-sha",
      baseToStagedPatchTruncated: false,
      baseToUpstreamPatchTruncated: false,
    });
    expect(preview.files[0]?.baseToStagedPatch).toContain("ours");
    expect(preview.files[0]?.baseToUpstreamPatch).toContain("theirs");
  });

  it("omits the base blob sha for add-vs-upstream-add conflicts", () => {
    const preview = buildRebaseConflictPreviewFromStagedFiles({
      branch: "main",
      conflicts: [
        {
          kind: "text",
          filePath: "TODO.md",
          initialFilePath: "TODO.md",
          content: "ours\n",
          initialContent: "",
          upstreamContent: "theirs\n",
          upstreamSha: "upstream-sha",
          fileDeleted: false,
          parentCommitSha: null,
          branch: "main",
        },
      ],
    });

    expect(preview.files[0]?.baseBlobSha).toBeUndefined();
    expect(preview.files[0]?.baseToStagedPatch).toContain("+ours");
    expect(preview.files[0]?.baseToUpstreamPatch).toContain("+theirs");
  });

  it("carries the resolved upstream path for renamed conflicts", () => {
    const preview = buildRebaseConflictPreviewFromStagedFiles({
      branch: "main",
      conflicts: [
        {
          kind: "text",
          filePath: "docs/TODO.md",
          initialFilePath: "TODO.md",
          content: ["alpha", "ours", ""].join("\n"),
          initialContent: ["alpha", "base", ""].join("\n"),
          upstreamContent: ["alpha", "theirs", ""].join("\n"),
          upstreamPath: "TODO.md",
          upstreamSha: "upstream-sha",
          fileDeleted: false,
          parentCommitSha: "base-sha",
          branch: "main",
        },
      ],
    });

    expect(preview.files[0]).toMatchObject({
      path: "docs/TODO.md",
      previousPath: "TODO.md",
      upstreamPath: "TODO.md",
    });
    expect(preview.files[0]?.baseToUpstreamPatch).toContain("+++ TODO.md");
  });
});
