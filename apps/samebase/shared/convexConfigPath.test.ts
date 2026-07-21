import { describe, expect, it } from "vite-plus/test";

import { getConvexConfigRootDirectory, normalizeConvexConfigPath } from "./convexConfigPath";

describe("normalizeConvexConfigPath", () => {
  it("uses a normalized repository-relative path to convex.json", () => {
    expect(normalizeConvexConfigPath(" convex.json ")).toBe("convex.json");
    expect(normalizeConvexConfigPath("apps/web/convex.json")).toBe("apps/web/convex.json");
  });

  it("rejects absolute, escaping, and non-Convex config paths", () => {
    for (const value of [
      "",
      "/convex.json",
      "C:/repo/convex.json",
      "apps\\web\\convex.json",
      "./convex.json",
      "apps/../convex.json",
      "apps//convex.json",
      "apps/Convex.json",
      "apps/convex.json/",
      "apps/package.json",
    ]) {
      expect(() => normalizeConvexConfigPath(value)).toThrow(
        "Convex config path must be a repository-relative path to convex.json.",
      );
    }
  });
});

describe("Convex config path roots", () => {
  it("derives the root directory from the config path", () => {
    expect(getConvexConfigRootDirectory("convex.json")).toBe("/");
    expect(getConvexConfigRootDirectory("apps/web/convex.json")).toBe("apps/web");
  });
});
