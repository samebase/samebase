import { describe, expect, it } from "vite-plus/test";

import { hasStagedFileChanges } from "./stagedFiles";

describe("hasStagedFileChanges", () => {
  const unchanged = {
    fileDeleted: false,
    parentCommitSha: "sha-1",
    filePath: "src/app.ts",
    initialFilePath: "src/app.ts",
    content: "same",
    initialContent: "same",
  };

  it("treats an unchanged tracked file as clean", () => {
    expect(hasStagedFileChanges(unchanged)).toBe(false);
  });

  it("detects a new file", () => {
    expect(hasStagedFileChanges({ ...unchanged, parentCommitSha: null })).toBe(true);
  });

  it("detects a deleted tracked file", () => {
    expect(hasStagedFileChanges({ ...unchanged, fileDeleted: true })).toBe(true);
  });

  it("detects changed contents", () => {
    expect(hasStagedFileChanges({ ...unchanged, content: "updated" })).toBe(true);
  });

  it("detects a rename", () => {
    expect(hasStagedFileChanges({ ...unchanged, filePath: "src/renamed.ts" })).toBe(true);
  });

  it("treats a create-then-delete tombstone as clean", () => {
    expect(
      hasStagedFileChanges({
        ...unchanged,
        parentCommitSha: null,
        fileDeleted: true,
      }),
    ).toBe(false);
  });
});
