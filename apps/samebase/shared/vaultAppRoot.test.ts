import { describe, expect, it } from "vite-plus/test";

import { normalizeVaultAppRoot } from "./vaultAppRoot";

describe("normalizeVaultAppRoot", () => {
  it("normalizes repository-relative app roots", () => {
    expect(normalizeVaultAppRoot(" apps\\noter/ ")).toBe("apps/samebase");
    expect(normalizeVaultAppRoot("/apps/samebase/")).toBe("apps/samebase");
    expect(normalizeVaultAppRoot(".")).toBe(".");
  });

  it("rejects absolute host paths before slash normalization", () => {
    for (const value of [
      "C:\\Users\\Ada\\repo",
      "C:/Users/Ada/repo",
      "\\\\server\\repo",
      "//server/repo",
    ]) {
      expect(() => normalizeVaultAppRoot(value)).toThrow(
        "App root must be a repository-relative path.",
      );
    }
  });
});
