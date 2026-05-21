import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  filterSimpleViewTreeItems,
  getSimpleViewPreferenceStorageKey,
  hasSimpleViewConfigFile,
  hasStagedSimpleViewConfigFile,
  isStagedSimpleViewConfigDeleted,
  parseSimpleViewConfig,
  shouldLoadRepositorySimpleViewConfig,
} from "./simpleView";

type TreeItem = {
  path: string;
  type: "tree" | "blob";
};

const UPDATE_SIMPLE_VIEW_FIXTURES = process.env.UPDATE_SIMPLE_VIEW_FIXTURES === "1";
// Regenerate fixtures with:
// UPDATE_SIMPLE_VIEW_FIXTURES=1 pnpm exec vp test run apps/noter/src/lib/simpleView.test.ts

function getRepositoryRoot(): string {
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

function getRootNoterMarkdown(): string {
  return readFileSync(`${getRepositoryRoot()}/noter.md`, "utf8");
}

function getTrackedFiles(): string[] {
  const trackedFilesOutput = execSync("git ls-files", {
    cwd: getRepositoryRoot(),
    encoding: "utf8",
  });

  return trackedFilesOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function getRepositoryTreeItems(): TreeItem[] {
  const trackedFiles = getTrackedFiles();

  const directories = new Set<string>();
  trackedFiles.forEach((filePath) => {
    const pathParts = filePath.split("/");
    pathParts.pop();

    let currentDirectory = "";
    pathParts.forEach((pathPart, index) => {
      currentDirectory = index === 0 ? pathPart : `${currentDirectory}/${pathPart}`;
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

function getSimpleViewFixturesDir(): string {
  return `${getRepositoryRoot()}/apps/noter/src/lib/__fixtures__/simpleView`;
}

function toFixtureFilePath(fileName: string): string {
  return `${getSimpleViewFixturesDir()}/${fileName}`;
}

function serializePathList(paths: string[]): string {
  return `${paths.join("\n")}\n`;
}

function readPathFixture(fixturePath: string): string[] {
  return readFileSync(fixturePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function assertPathsContainFixture(fixturePath: string, actualPaths: string[]): void {
  if (UPDATE_SIMPLE_VIEW_FIXTURES) {
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, serializePathList(actualPaths), "utf8");
  }

  const expectedPaths = readPathFixture(fixturePath);
  const actualPathSet = new Set(actualPaths);
  const missingPaths = expectedPaths.filter((path) => !actualPathSet.has(path));
  expect(missingPaths).toEqual([]);
}

function getRootVisibleSimpleViewFilePaths(): string[] {
  const parsedConfig = parseSimpleViewConfig(getRootNoterMarkdown());
  if (!parsedConfig.hasValidConfig) {
    throw new Error("Expected root noter.md to have valid simpleView config");
  }

  return filterSimpleViewTreeItems(getRepositoryTreeItems(), parsedConfig.excludePatterns)
    .filter((item) => item.type === "blob")
    .map((item) => item.path)
    .sort((a, b) => a.localeCompare(b));
}

describe("repository file tree fixtures", () => {
  it("contains the visible simple-view baseline fixture for root noter.md", () => {
    const visibleFiles = getRootVisibleSimpleViewFilePaths();

    assertPathsContainFixture(toFixtureFilePath("visible-simple-view-files.txt"), visibleFiles);
  });

  it("keeps visible spec files on the numbered underscore naming convention", () => {
    const visibleSpecPaths = getRootVisibleSimpleViewFilePaths().filter((path) =>
      path.startsWith("specs/"),
    );

    const invalidSpecPaths = visibleSpecPaths.filter((path) => {
      const specFileName = path.slice("specs/".length);
      // The folder policy document is intentionally unnumbered; the numbered
      // naming convention applies to accepted spec docs, not the directory map.
      if (specFileName === "README.md") {
        return false;
      }
      return !/^\d{3}_.+\.md$/.test(specFileName);
    });

    expect(invalidSpecPaths).toEqual([]);
  });
});

describe("getSimpleViewPreferenceStorageKey", () => {
  it("returns the per-vault key format", () => {
    expect(getSimpleViewPreferenceStorageKey("vault_123")).toBe("noter-simple-view:vault_123");
  });
});

describe("simple view config source resolution", () => {
  it("detects staged noter.md when present", () => {
    expect(
      hasStagedSimpleViewConfigFile({
        fileDeleted: false,
      }),
    ).toBe(true);
  });

  it("does not treat deleted staged noter.md as available", () => {
    expect(
      hasStagedSimpleViewConfigFile({
        fileDeleted: true,
      }),
    ).toBe(false);
  });

  it("detects staged noter.md deletion state", () => {
    expect(
      isStagedSimpleViewConfigDeleted({
        fileDeleted: true,
      }),
    ).toBe(true);
  });

  it("treats repository noter.md fallback as config when not staged", () => {
    expect(hasSimpleViewConfigFile(null, "---\nsimpleView:\n  exclude: []\n---")).toBe(true);
  });

  it("does not fall back to repository config when staged noter.md is deleted", () => {
    expect(
      hasSimpleViewConfigFile(
        {
          fileDeleted: true,
        },
        "---\nsimpleView:\n  exclude: []\n---",
      ),
    ).toBe(false);
  });

  it("returns no config when staged is missing and repository content is missing", () => {
    expect(hasSimpleViewConfigFile(null, null)).toBe(false);
  });

  it("does not load repository config before staged query resolves", () => {
    expect(shouldLoadRepositorySimpleViewConfig(undefined, false)).toBe(false);
  });

  it("loads repository config when staged query resolved and file is not staged", () => {
    expect(shouldLoadRepositorySimpleViewConfig(null, false)).toBe(true);
  });

  it("skips repository load after first attempt", () => {
    expect(shouldLoadRepositorySimpleViewConfig(null, true)).toBe(false);
  });

  it("skips repository load when staged noter.md exists", () => {
    expect(
      shouldLoadRepositorySimpleViewConfig(
        {
          fileDeleted: false,
        },
        false,
      ),
    ).toBe(false);
  });

  it("skips repository load when staged noter.md is deleted", () => {
    expect(
      shouldLoadRepositorySimpleViewConfig(
        {
          fileDeleted: true,
        },
        false,
      ),
    ).toBe(false);
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
    - .vite-hooks/pre-commit
---
content
`);

    expect(parsed.hasValidConfig).toBe(true);
    expect(parsed.excludePatterns).toEqual([".vite-hooks/pre-commit"]);
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
    { path: ".vite-hooks", type: "tree" as const },
    { path: ".vite-hooks/pre-commit", type: "blob" as const },
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
      { path: ".vite-hooks", type: "tree" },
      { path: ".vite-hooks/pre-commit", type: "blob" },
      { path: "docs", type: "tree" },
      { path: "docs/guide.md", type: "blob" },
      { path: "tsconfig.base.json", type: "blob" },
    ]);
  });

  it("supports exact matching for dotted root filenames", () => {
    const filtered = filterSimpleViewTreeItems(tree, ["tsconfig.base.json"]);
    expect(filtered.some((item) => item.path === "tsconfig.base.json")).toBe(false);
  });

  it("matches nested hook files with explicit directory pattern", () => {
    const filtered = filterSimpleViewTreeItems(tree, [".vite-hooks/pre-commit"]);
    expect(filtered.some((item) => item.path === ".vite-hooks/pre-commit")).toBe(false);
  });

  it("keeps always-included files even when simple-view rules exclude them", () => {
    const filtered = filterSimpleViewTreeItems(tree, ["src/**"], {
      alwaysIncludePaths: ["src/main.tsx"],
    });

    expect(filtered).toEqual([
      { path: ".vite-hooks", type: "tree" },
      { path: ".vite-hooks/pre-commit", type: "blob" },
      { path: "src", type: "tree" },
      { path: "src/main.tsx", type: "blob" },
      { path: "docs", type: "tree" },
      { path: "docs/guide.md", type: "blob" },
      { path: "tsconfig.base.json", type: "blob" },
    ]);
  });

  it("keeps ancestor folders for always-included files when folders are excluded directly", () => {
    const filtered = filterSimpleViewTreeItems(
      [
        { path: "src", type: "tree" as const },
        { path: "src/components", type: "tree" as const },
        { path: "src/components/panel.tsx", type: "blob" as const },
      ],
      ["src", "src/components"],
      {
        alwaysIncludePaths: ["src/components/panel.tsx"],
      },
    );

    expect(filtered).toEqual([
      { path: "src", type: "tree" },
      { path: "src/components", type: "tree" },
      { path: "src/components/panel.tsx", type: "blob" },
    ]);
  });

  it("does not treat basename-only pattern as recursive", () => {
    const filtered = filterSimpleViewTreeItems(tree, ["pre-commit"]);
    expect(filtered.some((item) => item.path === ".vite-hooks/pre-commit")).toBe(true);
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
        (item) => item.path === ".vite-hooks/pre-commit" && item.type === "blob",
      ),
    ).toBe(true);
  });

  it("hides tsconfig.base.json with an exact filename pattern", () => {
    const filtered = filterSimpleViewTreeItems(repositoryTreeItems, ["tsconfig.base.json"]);

    expect(
      filtered.some((item) => item.path === "tsconfig.base.json" && item.type === "blob"),
    ).toBe(false);
  });

  it("requires path-aware pattern to hide .vite-hooks/pre-commit", () => {
    const basenamePatternFiltered = filterSimpleViewTreeItems(repositoryTreeItems, ["pre-commit"]);
    expect(
      basenamePatternFiltered.some(
        (item) => item.path === ".vite-hooks/pre-commit" && item.type === "blob",
      ),
    ).toBe(true);

    const explicitPathFiltered = filterSimpleViewTreeItems(repositoryTreeItems, [
      ".vite-hooks/pre-commit",
    ]);
    expect(
      explicitPathFiltered.some(
        (item) => item.path === ".vite-hooks/pre-commit" && item.type === "blob",
      ),
    ).toBe(false);
  });
});

describe("current noter.md config with repository tree", () => {
  const repositoryTreeItems = getRepositoryTreeItems();
  const parsedConfig = parseSimpleViewConfig(getRootNoterMarkdown());

  it("parses root noter.md simpleView config", () => {
    expect(parsedConfig.hasConfigFile).toBe(true);
    expect(parsedConfig.hasValidConfig).toBe(true);
    expect(parsedConfig.excludePatterns.length).toBeGreaterThan(0);
  });

  it("hides known noisy files from this repository", () => {
    if (!parsedConfig.hasValidConfig) {
      throw new Error("Expected root noter.md to have valid simpleView config");
    }

    const filtered = filterSimpleViewTreeItems(repositoryTreeItems, parsedConfig.excludePatterns);

    expect(filtered.some((item) => item.path === "tsconfig.base.json")).toBe(false);
    expect(filtered.some((item) => item.path === ".vite-hooks/pre-commit")).toBe(false);
    expect(filtered.some((item) => item.path === "apps/noter/src/components/Untitled-1.md")).toBe(
      false,
    );
    expect(filtered.some((item) => item.path === "apps/noter/convex/README.md")).toBe(false);
  });

  it("keeps top-level docs visible", () => {
    if (!parsedConfig.hasValidConfig) {
      throw new Error("Expected root noter.md to have valid simpleView config");
    }

    const filtered = filterSimpleViewTreeItems(repositoryTreeItems, parsedConfig.excludePatterns);

    expect(filtered.some((item) => item.path === "AGENTS.md")).toBe(true);
  });
});
