import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { type GithubTreeType } from "convex/schema";

// ---------------------------------------------------------------------------
// File extensions to load into Monaco models for import resolution
// ---------------------------------------------------------------------------
const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "d.ts",
]);

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
  tree: GithubTreeType[],
  treeSHA: string,
) {
  const batchReadFiles = useAction(api.fileStagingActions.batchReadFiles);

  const [files, setFiles] = useState<ProjectFile[]>(() => {
    if (!vaultId) return [];
    return projectFilesCache.get(`${vaultId}:${treeSHA}`) ?? [];
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vaultId) return;

    const cacheKey = `${vaultId}:${treeSHA}`;

    // Already cached
    const cached = projectFilesCache.get(cacheKey);
    if (cached) {
      setFiles(cached);
      return;
    }

    // Already fetching
    if (pendingFetches.has(cacheKey)) return;

    // Determine which files to fetch
    const paths = tree
      .filter((entry) => shouldInclude(entry) || shouldIncludeTsConfig(entry))
      .map((entry) => entry.path);

    if (paths.length === 0) return;

    let cancelled = false;
    setLoading(true);
    pendingFetches.add(cacheKey);

    batchReadFiles({ vaultId, filePaths: paths })
      .then((result) => {
        projectFilesCache.set(cacheKey, result);
        pendingFetches.delete(cacheKey);
        if (!cancelled) {
          setFiles(result);
          setLoading(false);
        }
      })
      .catch((error) => {
        pendingFetches.delete(cacheKey);
        if (!cancelled) {
          console.error(
            "useProjectFiles: failed to load project files:",
            error,
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, treeSHA]);

  return { files, loading };
}
