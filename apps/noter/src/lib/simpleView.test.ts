import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  filterSimpleViewTreeItems,
  getSimpleViewPreferenceStorageKey,
  parseSimpleViewConfig,
} from "./simpleView";

type TreeItem = {
  path: string;
  type: "tree" | "blob";
};

function getRepositoryTreeItems(): TreeItem[] {
  const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const trackedFilesOutput = execSync("git ls-files", {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const trackedFiles = trackedFilesOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));

  const directories = new Set<string>();
  trackedFiles.forEach((filePath) => {
    const pathParts = filePath.split("/");
    pathParts.pop();

    let currentDirectory = "";
    pathParts.forEach((pathPart, index) => {
      currentDirectory =
        index === 0 ? pathPart : `${currentDirectory}/${pathPart}`;
      directories.add(currentDirectory);
    });
  });

  const directoryItems = [...directories]
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({ path, type: "tree" as const }));
  const fileItems = trackedFiles.map((path) => ({
    path,
    type: "blob" as const,
  }));

  return [...directoryItems, ...fileItems];
}

describe("getSimpleViewPreferenceStorageKey", () => {
  it("returns the per-vault key format", () => {
    expect(getSimpleViewPreferenceStorageKey("vault_123")).toBe(
      "noter-simple-view:vault_123",
    );
  });
});

describe("parseSimpleViewConfig", () => {
  it("returns no-config defaults for null", () => {
    expect(parseSimpleViewConfig(null)).toEqual({
      hasConfigFile: false,
      hasValidConfig: false,
      excludePatterns: [],
    });
  });

  it("treats markdown without frontmatter as invalid simple-view config", () => {
    expect(parseSimpleViewConfig("# title\n\nbody")).toEqual({
      hasConfigFile: true,
      hasValidConfig: false,
      excludePatterns: [],
    });
  });

  it("parses valid YAML frontmatter and trims exclude patterns", () => {
    const parsed = parseSimpleViewConfig(`---
simpleView:
  exclude:
    - src/** # source
    - "  tsconfig.base.json  "
    - "   "
---
# noter.md
`);

    expect(parsed).toEqual({
      hasConfigFile: true,
      hasValidConfig: true,
      excludePatterns: ["src/**", "tsconfig.base.json"],
    });
  });

  it("supports files that start with UTF-8 BOM", () => {
    const parsed = parseSimpleViewConfig(`\uFEFF---
simpleView:
  exclude:
    - .husky/pre-commit
---
content
`);

    expect(parsed.hasValidConfig).toBe(true);
    expect(parsed.excludePatterns).toEqual([".husky/pre-commit"]);
  });

  it("fails validation when exclude is not an array", () => {
    const parsed = parseSimpleViewConfig(`---
simpleView:
  exclude: pre-commit
---
`);

    expect(parsed.hasConfigFile).toBe(true);
    expect(parsed.hasValidConfig).toBe(false);
    expect(parsed.excludePatterns).toEqual([]);
    expect(typeof parsed.error).toBe("string");
  });

  it("fails when frontmatter YAML is malformed", () => {
    const parsed = parseSimpleViewConfig(`---
simpleView:
  exclude:
    - src/**
  broken: [abc
---
`);

    expect(parsed.hasConfigFile).toBe(true);
    expect(parsed.hasValidConfig).toBe(false);
    expect(parsed.excludePatterns).toEqual([]);
    expect(typeof parsed.error).toBe("string");
  });

  it("fails safely when an unquoted glob is parsed as a YAML alias", () => {
    const parsed = parseSimpleViewConfig(`---
simpleView:
  exclude:
    - **/*.{ts,tsx}
---
`);

    expect(parsed.hasConfigFile).toBe(true);
    expect(parsed.hasValidConfig).toBe(false);
    expect(parsed.excludePatterns).toEqual([]);
    expect(typeof parsed.error).toBe("string");
  });
});

describe("filterSimpleViewTreeItems", () => {
  const tree = [
    { path: ".husky", type: "tree" as const },
    { path: ".husky/pre-commit", type: "blob" as const },
    { path: "src", type: "tree" as const },
    { path: "src/main.tsx", type: "blob" as const },
    { path: "docs", type: "tree" as const },
    { path: "docs/guide.md", type: "blob" as const },
    { path: "tsconfig.base.json", type: "blob" as const },
  ];

  it("returns all items when no patterns are provided", () => {
    expect(filterSimpleViewTreeItems(tree, [])).toEqual(tree);
  });

  it("excludes matching files and prunes empty folders", () => {
    const filtered = filterSimpleViewTreeItems(tree, ["src/**"]);
    expect(filtered).toEqual([
      { path: ".husky", type: "tree" },
      { path: ".husky/pre-commit", type: "blob" },
      { path: "docs", type: "tree" },
      { path: "docs/guide.md", type: "blob" },
      { path: "tsconfig.base.json", type: "blob" },
    ]);
  });

  it("supports exact matching for dotted root filenames", () => {
    const filtered = filterSimpleViewTreeItems(tree, ["tsconfig.base.json"]);
    expect(filtered.some((item) => item.path === "tsconfig.base.json")).toBe(
      false,
    );
  });

  it("matches nested hook files with explicit directory pattern", () => {
    const filtered = filterSimpleViewTreeItems(tree, [".husky/pre-commit"]);
    expect(filtered.some((item) => item.path === ".husky/pre-commit")).toBe(
      false,
    );
  });

  it("does not treat basename-only pattern as recursive", () => {
    const filtered = filterSimpleViewTreeItems(tree, ["pre-commit"]);
    expect(filtered.some((item) => item.path === ".husky/pre-commit")).toBe(
      true,
    );
  });
});

describe("filterSimpleViewTreeItems with repository structure", () => {
  const repositoryTreeItems = getRepositoryTreeItems();

  it("uses real repository paths in this workspace", () => {
    expect(
      repositoryTreeItems.some(
        (item) => item.path === "tsconfig.base.json" && item.type === "blob",
      ),
    ).toBe(true);
    expect(
      repositoryTreeItems.some(
        (item) => item.path === ".husky/pre-commit" && item.type === "blob",
      ),
    ).toBe(true);
  });

  it("hides tsconfig.base.json with an exact filename pattern", () => {
    const filtered = filterSimpleViewTreeItems(repositoryTreeItems, [
      "tsconfig.base.json",
    ]);

    expect(
      filtered.some(
        (item) => item.path === "tsconfig.base.json" && item.type === "blob",
      ),
    ).toBe(false);
  });

  it("requires path-aware pattern to hide .husky/pre-commit", () => {
    const basenamePatternFiltered = filterSimpleViewTreeItems(
      repositoryTreeItems,
      ["pre-commit"],
    );
    expect(
      basenamePatternFiltered.some(
        (item) => item.path === ".husky/pre-commit" && item.type === "blob",
      ),
    ).toBe(true);

    const explicitPathFiltered = filterSimpleViewTreeItems(repositoryTreeItems, [
      ".husky/pre-commit",
    ]);
    expect(
      explicitPathFiltered.some(
        (item) => item.path === ".husky/pre-commit" && item.type === "blob",
      ),
    ).toBe(false);
  });
});
