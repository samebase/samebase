import { minimatch } from "minimatch";
import { z } from "zod";
import { parseDocument } from "yaml";

export const SIMPLE_VIEW_CONFIG_PATH = "noter.md";
const SIMPLE_VIEW_STORAGE_KEY_PREFIX = "noter-simple-view";

type StagedSimpleViewConfigFile =
  | {
      fileDeleted: boolean;
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

const frontmatterRegex = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function getFrontmatterSource(markdown: string): string | null {
  const withoutBom = markdown.startsWith("\uFEFF")
    ? markdown.slice(1)
    : markdown;
  const match = withoutBom.match(frontmatterRegex);
  return match?.[1] ?? null;
}

export function getSimpleViewPreferenceStorageKey(vaultId: string): string {
  return `${SIMPLE_VIEW_STORAGE_KEY_PREFIX}:${vaultId}`;
}

export function hasStagedSimpleViewConfigFile(
  stagedConfigFile: StagedSimpleViewConfigFile,
): stagedConfigFile is { fileDeleted: false } {
  return (
    stagedConfigFile !== undefined &&
    stagedConfigFile !== null &&
    !stagedConfigFile.fileDeleted
  );
}

export function hasSimpleViewConfigFile(
  stagedConfigFile: StagedSimpleViewConfigFile,
  repositoryConfigContent: string | null,
): boolean {
  return (
    hasStagedSimpleViewConfigFile(stagedConfigFile) ||
    repositoryConfigContent !== null
  );
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
  return !didAttemptRepositoryLoad;
}

export function parseSimpleViewConfig(
  noterMarkdown: string | null | undefined,
): SimpleViewConfig {
  if (noterMarkdown === null || noterMarkdown === undefined) {
    return {
      hasConfigFile: false,
      hasValidConfig: false,
      excludePatterns: [],
    };
  }

  const frontmatterSource = getFrontmatterSource(noterMarkdown);
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
): T[] {
  if (excludePatterns.length === 0) {
    return items;
  }

  const includedItems = items.filter(
    (item) => !isExcluded(item.path, excludePatterns),
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
