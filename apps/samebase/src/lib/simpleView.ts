import { guard } from "@samebase/dependent";
import { minimatch } from "minimatch";
import { z } from "zod";
import { parseDocument } from "yaml";

import { getAncestorFolderPaths } from "./fileTreeState";

export const SIMPLE_VIEW_CONFIG_PATH = "samebase.md";
const SIMPLE_VIEW_STORAGE_KEY_PREFIX = "samebase-simple-view";

type StagedSimpleViewConfigFile =
  | {
      fileDeleted: false;
    }
  | {
      fileDeleted: true;
    }
  | null
  | undefined;

const simpleViewFrontmatterSchema = z.object({
  simpleView: z
    .object({
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
});

export type SimpleViewConfig = {
  hasConfigFile: boolean;
  hasValidConfig: boolean;
  excludePatterns: string[];
  error?: string;
};

type TreeItem = {
  path: string;
  type: "tree" | "blob";
};

type FilterSimpleViewTreeItemsOptions = {
  alwaysIncludePaths?: readonly string[];
};

const frontmatterRegex = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function getFrontmatterSource(markdown: string): string | null {
  const withoutBom = markdown.startsWith("\uFEFF") ? markdown.slice(1) : markdown;
  const match = withoutBom.match(frontmatterRegex);
  return match?.[1] ?? null;
}

export function getSimpleViewPreferenceStorageKey(vaultId: string): string {
  return `${SIMPLE_VIEW_STORAGE_KEY_PREFIX}:${vaultId}`;
}

export const hasStagedSimpleViewConfigFile = guard<
  StagedSimpleViewConfigFile,
  { fileDeleted: false }
>((stagedConfigFile) =>
  stagedConfigFile !== undefined && stagedConfigFile !== null && !stagedConfigFile.fileDeleted
    ? stagedConfigFile
    : null,
);

export const isStagedSimpleViewConfigDeleted = guard<
  StagedSimpleViewConfigFile,
  { fileDeleted: true }
>((stagedConfigFile) =>
  stagedConfigFile !== undefined && stagedConfigFile !== null && stagedConfigFile.fileDeleted
    ? stagedConfigFile
    : null,
);

export function hasSimpleViewConfigFile(
  stagedConfigFile: StagedSimpleViewConfigFile,
  repositoryConfigContent: string | null,
): boolean {
  if (isStagedSimpleViewConfigDeleted(stagedConfigFile)) {
    return false;
  }
  return hasStagedSimpleViewConfigFile(stagedConfigFile) || repositoryConfigContent !== null;
}

export function shouldLoadRepositorySimpleViewConfig(
  stagedConfigFile: StagedSimpleViewConfigFile,
  didAttemptRepositoryLoad: boolean,
): boolean {
  if (stagedConfigFile === undefined) {
    return false;
  }
  if (hasStagedSimpleViewConfigFile(stagedConfigFile)) {
    return false;
  }
  if (isStagedSimpleViewConfigDeleted(stagedConfigFile)) {
    return false;
  }
  return !didAttemptRepositoryLoad;
}

export function parseSimpleViewConfig(
  samebaseMarkdown: string | null | undefined,
): SimpleViewConfig {
  if (samebaseMarkdown === null || samebaseMarkdown === undefined) {
    return {
      hasConfigFile: false,
      hasValidConfig: false,
      excludePatterns: [],
    };
  }

  const frontmatterSource = getFrontmatterSource(samebaseMarkdown);
  if (!frontmatterSource) {
    return {
      hasConfigFile: true,
      hasValidConfig: false,
      excludePatterns: [],
    };
  }

  const document = parseDocument(frontmatterSource, {
    prettyErrors: false,
  });

  if (document.errors.length > 0) {
    return {
      hasConfigFile: true,
      hasValidConfig: false,
      excludePatterns: [],
      error: document.errors[0]?.message,
    };
  }

  let parsedFrontmatter: unknown;
  try {
    parsedFrontmatter = document.toJS();
  } catch (error) {
    return {
      hasConfigFile: true,
      hasValidConfig: false,
      excludePatterns: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const validated = simpleViewFrontmatterSchema.safeParse(parsedFrontmatter);
  if (!validated.success) {
    return {
      hasConfigFile: true,
      hasValidConfig: false,
      excludePatterns: [],
      error: validated.error.issues[0]?.message,
    };
  }

  const excludePatterns =
    validated.data.simpleView?.exclude
      ?.map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0) ?? [];

  return {
    hasConfigFile: true,
    hasValidConfig: true,
    excludePatterns,
  };
}

function isExcluded(path: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((pattern) =>
    minimatch(path, pattern, {
      dot: true,
      nocomment: true,
      nonegate: true,
    }),
  );
}

export function filterSimpleViewTreeItems<T extends TreeItem>(
  items: T[],
  excludePatterns: string[],
  options?: FilterSimpleViewTreeItemsOptions,
): T[] {
  if (excludePatterns.length === 0) {
    return items;
  }

  const alwaysIncludePaths = new Set<string>();
  for (const path of options?.alwaysIncludePaths ?? []) {
    alwaysIncludePaths.add(path);
    for (const folderPath of getAncestorFolderPaths(path)) {
      alwaysIncludePaths.add(folderPath);
    }
  }

  const includedItems = items.filter(
    (item) => alwaysIncludePaths.has(item.path) || !isExcluded(item.path, excludePatterns),
  );
  const includedPaths = includedItems.map((item) => item.path);

  return includedItems.filter((item) => {
    if (item.type === "blob") {
      return true;
    }

    const folderPrefix = `${item.path}/`;
    return includedPaths.some((path) => path.startsWith(folderPrefix));
  });
}
