import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { type GithubTreeType } from "convex/schema";
import { buildProjectFilesCacheKey } from "@/lib/editorCacheKeys";

// ---------------------------------------------------------------------------
// File extensions to load into Monaco models for import resolution
// ---------------------------------------------------------------------------
const SOURCE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "json", "d.ts"]);

// Directories to skip entirely
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "build",
  ".git",
  ".turbo",
  "coverage",
  "__pycache__",
]);

const MAX_BATCH_FILE_PATHS = 200;
const REPO_SCOPE_ROOTS = new Set(["apps", "packages"]);

function shouldInclude(entry: GithubTreeType): boolean {
  if (entry.type !== "blob") return false;

  // Skip files > 100KB
  if (entry.size !== undefined && entry.size > 100_000) return false;

  // Skip files in ignored directories
  const parts = entry.path.split("/");
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) return false;
  }

  // Check extension (handle .d.ts as a special case)
  if (entry.path.endsWith(".d.ts")) return true;
  const ext = entry.path.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return SOURCE_EXTENSIONS.has(ext);
}

// Also always include tsconfig.json (for compiler options)
function shouldIncludeTsConfig(entry: GithubTreeType): boolean {
  return (
    entry.type === "blob" &&
    (entry.path === "tsconfig.json" || entry.path.endsWith("/tsconfig.json"))
  );
}

function getScopePrefix(activeFilePath: string): string | null {
  const parts = activeFilePath.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) {
    return null;
  }

  const root = parts[0];
  if (!REPO_SCOPE_ROOTS.has(root)) {
    return null;
  }

  return `${root}/${parts[1]}/`;
}

function rankPath(path: string, scopePrefix: string | null): number {
  if (path === "tsconfig.base.json") return 0;
  if (path === "tsconfig.json") return 1;
  if (path.endsWith("/tsconfig.json")) return 2;
  if (scopePrefix !== null && path.startsWith(scopePrefix)) return 3;
  if (path === "package.json") return 4;
  return 5;
}

function prioritizePaths(paths: string[], activeFilePath: string): string[] {
  const scopePrefix = getScopePrefix(activeFilePath);
  const ranked = paths.map((path, index) => ({
    path,
    index,
    rank: rankPath(path, scopePrefix),
  }));

  const scoped =
    scopePrefix === null ? ranked : ranked.filter((p) => p.rank <= 4);
  const pool = scoped.length > 0 ? scoped : ranked;

  pool.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return pool.map((item) => item.path);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type ProjectFile = { path: string; content: string };

// Module-level cache so project files survive component remounts
// (MonacoEditor remounts on every file switch due to its key prop).
const projectFilesCache = new Map<string, ProjectFile[]>();
// Track in-flight fetches so we don't fire duplicates
const pendingFetches = new Set<string>();

export function useProjectFiles(
  vaultId: Id<"vaults"> | undefined,
  branch: string,
  tree: GithubTreeType[],
  treeSHA: string,
  activeFilePath: string,
) {
  const batchReadFiles = useAction(api.fileStagingActions.batchReadFiles);
  const scopePrefix = getScopePrefix(activeFilePath) ?? "repo";

  const [files, setFiles] = useState<ProjectFile[]>(() => {
    if (!vaultId) return [];
    return (
      projectFilesCache.get(
        buildProjectFilesCacheKey({
          vaultId,
          branch,
          treeSHA,
          scopePrefix,
        }),
      ) ?? []
    );
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vaultId) {
      setFiles([]);
      setLoading(false);
      return;
    }

    const cacheKey = buildProjectFilesCacheKey({
      vaultId,
      branch,
      treeSHA,
      scopePrefix,
    });

    // Already cached
    const cached = projectFilesCache.get(cacheKey);
    if (cached) {
      setFiles(cached);
      setLoading(false);
      return;
    }

    // Already fetching
    if (pendingFetches.has(cacheKey)) return;

    setFiles([]);

    // Determine which files to fetch
    const candidatePaths = tree
      .filter((entry) => shouldInclude(entry) || shouldIncludeTsConfig(entry))
      .map((entry) => entry.path);
    const uniquePaths = Array.from(new Set(candidatePaths));
    const paths = prioritizePaths(uniquePaths, activeFilePath).slice(
      0,
      MAX_BATCH_FILE_PATHS,
    );

    if (paths.length === 0) {
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    pendingFetches.add(cacheKey);

    void (async () => {
      try {
        const result = await batchReadFiles({
          vaultId,
          branch,
          filePaths: paths,
        });
        projectFilesCache.set(cacheKey, result);
        pendingFetches.delete(cacheKey);
        if (!abortController.signal.aborted) {
          setFiles(result);
          setLoading(false);
        }
      } catch (error) {
        pendingFetches.delete(cacheKey);
        if (!abortController.signal.aborted) {
          console.error(
            "useProjectFiles: failed to load project files:",
            error,
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, branch, treeSHA, scopePrefix, activeFilePath]);

  return { files, loading, scopePrefix };
}
