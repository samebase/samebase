import { describe, expect, it } from "vite-plus/test";

import { normalizeVaultRootDirectory } from "./vaultRootDirectory";

describe("normalizeVaultRootDirectory", () => {
  it("uses Cloudflare's root directory spelling", () => {
    expect(normalizeVaultRootDirectory("/")).toBe("/");
    expect(normalizeVaultRootDirectory(" apps/samebase ")).toBe("apps/samebase");
  });

  it("requires a root directory", () => {
    expect(() => normalizeVaultRootDirectory("  ")).toThrow("Root directory is required.");
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
      expect(() => normalizeVaultRootDirectory(value)).toThrow(
        "Root directory must be / or a repository-relative path.",
      );
    }
  });
});
