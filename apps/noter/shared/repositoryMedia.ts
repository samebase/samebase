const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
]);

export type RepositoryMediaKind = "image";

function getNormalizedExtension(filePath: string): string | null {
  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const extension = trimmed.split(".").pop()?.toLowerCase();
  return extension && extension.length > 0 ? extension : null;
}

export function getRepositoryMediaKind(
  filePath: string,
): RepositoryMediaKind | null {
  const extension = getNormalizedExtension(filePath);
  if (!extension) {
    return null;
  }

  return IMAGE_EXTENSIONS.has(extension) ? "image" : null;
}

export function isRenderableRepositoryMediaPath(filePath: string): boolean {
  return getRepositoryMediaKind(filePath) !== null;
}

export function isSvgRepositoryMediaPath(filePath: string): boolean {
  return getNormalizedExtension(filePath) === "svg";
}
