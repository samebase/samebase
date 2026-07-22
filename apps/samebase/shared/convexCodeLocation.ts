import { getConvexConfigRootDirectory, normalizeConvexConfigPath } from "./convexConfigPath";
import { normalizeVaultRootDirectory, VAULT_ROOT_DIRECTORY } from "./vaultRootDirectory";

const CONVEX_DIRECTORY_BASENAME = "convex";

export type ConvexCodeLocation =
  | {
      kind: "config";
      convexConfigPath: string;
    }
  | {
      kind: "directory";
      convexDirectoryPath: string;
    };

export type ConvexCodeLocationFields =
  | { convexConfigPath: string }
  | { convexDirectoryPath: string };

export function normalizeConvexDirectoryPath(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    normalized.includes("\\")
  ) {
    throw new Error("Convex directory path must be a repository-relative path to convex.");
  }

  const segments = normalized.split("/");
  if (
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    segments.at(-1) !== CONVEX_DIRECTORY_BASENAME
  ) {
    throw new Error("Convex directory path must be a repository-relative path to convex.");
  }

  return segments.join("/");
}

export function getConvexDirectoryRootDirectory(value: string): string {
  const segments = normalizeConvexDirectoryPath(value).split("/");
  segments.pop();
  return segments.length === 0
    ? VAULT_ROOT_DIRECTORY
    : normalizeVaultRootDirectory(segments.join("/"));
}

export function normalizeConvexCodeLocation(location: ConvexCodeLocation): ConvexCodeLocation {
  switch (location.kind) {
    case "config":
      return {
        kind: "config",
        convexConfigPath: normalizeConvexConfigPath(location.convexConfigPath),
      };
    case "directory":
      return {
        kind: "directory",
        convexDirectoryPath: normalizeConvexDirectoryPath(location.convexDirectoryPath),
      };
    default:
      location satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

export function readConvexCodeLocation(fields: ConvexCodeLocationFields): ConvexCodeLocation {
  return "convexConfigPath" in fields
    ? { kind: "config", convexConfigPath: normalizeConvexConfigPath(fields.convexConfigPath) }
    : {
        kind: "directory",
        convexDirectoryPath: normalizeConvexDirectoryPath(fields.convexDirectoryPath),
      };
}

export function getConvexCodeRootDirectory(location: ConvexCodeLocation): string {
  switch (location.kind) {
    case "config":
      return getConvexConfigRootDirectory(location.convexConfigPath);
    case "directory":
      return getConvexDirectoryRootDirectory(location.convexDirectoryPath);
    default:
      location satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

export function getConvexCodeLocationKey(location: ConvexCodeLocation): string {
  const normalized = normalizeConvexCodeLocation(location);
  switch (normalized.kind) {
    case "config":
      return `config:${normalized.convexConfigPath}`;
    case "directory":
      return `directory:${normalized.convexDirectoryPath}`;
    default:
      normalized satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}

export function getConvexCodeLocationPath(location: ConvexCodeLocation): string {
  const normalized = normalizeConvexCodeLocation(location);
  switch (normalized.kind) {
    case "config":
      return normalized.convexConfigPath;
    case "directory":
      return `${normalized.convexDirectoryPath}/`;
    default:
      normalized satisfies never;
      throw new Error("Unsupported Convex code location.");
  }
}
