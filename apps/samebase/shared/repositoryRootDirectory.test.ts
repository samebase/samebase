import { describe, expect, it } from "vite-plus/test";

import { normalizeRepositoryRootDirectory } from "./repositoryRootDirectory";

describe("normalizeRepositoryRootDirectory", () => {
  it("uses Cloudflare's root directory spelling", () => {
    expect(normalizeRepositoryRootDirectory("/")).toBe("/");
    expect(normalizeRepositoryRootDirectory(" apps/samebase ")).toBe("apps/samebase");
  });

  it("requires a root directory", () => {
    expect(() => normalizeRepositoryRootDirectory("  ")).toThrow("Root directory is required.");
  });

  it("rejects paths outside Cloudflare's root directory vocabulary", () => {
    for (const value of [
      "C:\\Users\\Ada\\repo",
      "C:/Users/Ada/repo",
      "\\\\server\\repo",
      "//server/repo",
      "/apps/samebase",
      "apps\\samebase",
      "apps/samebase/",
      "apps//samebase",
      "apps/../samebase",
      ".",
      "./apps/samebase",
    ]) {
      expect(() => normalizeRepositoryRootDirectory(value)).toThrow(
        "Root directory must be / or a repository-relative path.",
      );
    }
  });
});
