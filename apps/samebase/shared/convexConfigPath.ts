import {
  normalizeRepositoryRootDirectory,
  REPOSITORY_ROOT_DIRECTORY,
} from "./repositoryRootDirectory";

const CONVEX_CONFIG_BASENAME = "convex.json";

export function normalizeConvexConfigPath(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    normalized.includes("\\")
  ) {
    throw new Error("Convex config path must be a repository-relative path to convex.json.");
  }

  const segments = normalized.split("/");
  if (
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    segments.at(-1) !== CONVEX_CONFIG_BASENAME
  ) {
    throw new Error("Convex config path must be a repository-relative path to convex.json.");
  }

  return segments.join("/");
}

export function getConvexConfigRootDirectory(value: string): string {
  const segments = normalizeConvexConfigPath(value).split("/");
  segments.pop();
  return segments.length === 0
    ? REPOSITORY_ROOT_DIRECTORY
    : normalizeRepositoryRootDirectory(segments.join("/"));
}
