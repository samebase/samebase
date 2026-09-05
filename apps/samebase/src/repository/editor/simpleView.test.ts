import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const repositoryConfig = parseSimpleViewConfig(
  readFileSync(new URL("../../../../../samebase.md", import.meta.url), "utf8"),
);

describe("repository documentation", () => {
  it("keeps visible spec files on the numbered underscore naming convention", () => {
    const trackedSpecPaths = execFileSync("git", ["ls-files", "--", "specs/"], {
      cwd: new URL("../../../../../", import.meta.url),
      encoding: "utf8",
    })
      .split("\n")
      .filter((path) => path.length > 0);
    const visibleSpecPaths = filterSimpleViewTreeItems(
      trackedSpecPaths.map((path) => ({ path, type: "blob" as const })),
      repositoryConfig.excludePatterns,
    ).map((item) => item.path);

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
  it("returns the per-repository key format", () => {
    expect(getSimpleViewPreferenceStorageKey("repository_123")).toBe(
      "samebase-simple-view:repository_123",
    );
  });
});

describe("simple view config source resolution", () => {
  it("detects staged samebase.md when present", () => {
    expect(
      hasStagedSimpleViewConfigFile({
        fileDeleted: false,
      }),
    ).toBe(true);
  });

  it("does not treat deleted staged samebase.md as available", () => {
    expect(
      hasStagedSimpleViewConfigFile({
        fileDeleted: true,
      }),
    ).toBe(false);
  });

  it("detects staged samebase.md deletion state", () => {
    expect(
      isStagedSimpleViewConfigDeleted({
        fileDeleted: true,
      }),
    ).toBe(true);
  });

  it("treats repository samebase.md fallback as config when not staged", () => {
    expect(hasSimpleViewConfigFile(null, "---\nsimpleView:\n  exclude: []\n---")).toBe(true);
  });

  it("does not fall back to repository config when staged samebase.md is deleted", () => {
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

  it("skips repository load when staged samebase.md exists", () => {
    expect(
      shouldLoadRepositorySimpleViewConfig(
        {
          fileDeleted: false,
        },
        false,
      ),
    ).toBe(false);
  });

  it("skips repository load when staged samebase.md is deleted", () => {
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
# samebase.md
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

describe("current samebase.md config", () => {
  it("parses root samebase.md simpleView config", () => {
    expect(repositoryConfig.hasConfigFile).toBe(true);
    expect(repositoryConfig.hasValidConfig).toBe(true);
    expect(repositoryConfig.excludePatterns.length).toBeGreaterThan(0);
  });

  it("keeps documentation visible and hides implementation files", () => {
    const paths = [
      "AGENTS.md",
      "README.md",
      "docs/guide.md",
      "specs/001_FEATURE_SPEC.md",
      "rfcs/proposal.md",
      "archive/old-plan.md",
      "tsconfig.base.json",
      ".vite-hooks/pre-commit",
      "apps/samebase/src/components/notes.md",
      "apps/samebase/convex/README.md",
      "node_modules/example/README.md",
      "apps/example/dist/index.html",
    ];
    const filtered = filterSimpleViewTreeItems(
      paths.map((path) => ({ path, type: "blob" as const })),
      repositoryConfig.excludePatterns,
    );

    expect(filtered.map((item) => item.path)).toEqual([
      "AGENTS.md",
      "README.md",
      "docs/guide.md",
      "specs/001_FEATURE_SPEC.md",
      "rfcs/proposal.md",
      "archive/old-plan.md",
    ]);
  });
});
