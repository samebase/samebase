import { describe, expect, it } from "vite-plus/test";

import {
  getConvexCodeLocationKey,
  getConvexCodeLocationPath,
  getConvexCodeRootDirectory,
  getConvexDirectoryRootDirectory,
  normalizeConvexCodeLocation,
  normalizeConvexDirectoryPath,
  readConvexCodeLocation,
} from "./convexCodeLocation";

describe("Convex code locations", () => {
  it("normalizes root and nested default directories", () => {
    expect(normalizeConvexDirectoryPath(" convex ")).toBe("convex");
    expect(normalizeConvexDirectoryPath("apps/web/convex")).toBe("apps/web/convex");
  });

  it.each([
    "",
    "/convex",
    "C:/repo/convex",
    "apps\\web\\convex",
    "./convex",
    "apps/../convex",
    "apps//convex",
    "apps/convex/",
    "apps/backend",
    "apps/Convex",
  ])("rejects invalid default directory path %s", (value) => {
    expect(() => normalizeConvexDirectoryPath(value)).toThrow(
      "Convex directory path must be a repository-relative path to convex.",
    );
  });

  it("derives roots from both location kinds", () => {
    expect(getConvexDirectoryRootDirectory("convex")).toBe("/");
    expect(getConvexDirectoryRootDirectory("apps/web/convex")).toBe("apps/web");
    expect(
      getConvexCodeRootDirectory({ kind: "config", convexConfigPath: "apps/web/convex.json" }),
    ).toBe("apps/web");
    expect(
      getConvexCodeRootDirectory({
        kind: "directory",
        convexDirectoryPath: "apps/web/convex",
      }),
    ).toBe("apps/web");
  });

  it("normalizes persisted location fields into a discriminated value", () => {
    expect(readConvexCodeLocation({ convexConfigPath: " convex.json " })).toEqual({
      kind: "config",
      convexConfigPath: "convex.json",
    });
    expect(readConvexCodeLocation({ convexDirectoryPath: " apps/web/convex " })).toEqual({
      kind: "directory",
      convexDirectoryPath: "apps/web/convex",
    });
  });

  it("provides deterministic keys and user-visible paths", () => {
    const config = normalizeConvexCodeLocation({
      kind: "config",
      convexConfigPath: " apps/web/convex.json ",
    });
    const directory = normalizeConvexCodeLocation({
      kind: "directory",
      convexDirectoryPath: " apps/web/convex ",
    });

    expect(getConvexCodeLocationKey(config)).toBe("config:apps/web/convex.json");
    expect(getConvexCodeLocationKey(directory)).toBe("directory:apps/web/convex");
    expect(getConvexCodeLocationPath(config)).toBe("apps/web/convex.json");
    expect(getConvexCodeLocationPath(directory)).toBe("apps/web/convex/");
  });
});
