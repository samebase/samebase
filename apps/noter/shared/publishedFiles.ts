export type PublishedFileFormat = "markdown" | "plain_text";

/**
 * Keep the first public slice honest by only publishing text-first formats
 * that we can render accessibly without inventing a heavyweight viewer.
 */
export function readPublishedFileFormat(
  filePath: string,
): PublishedFileFormat | null {
  const normalizedFilePath = filePath.trim().toLowerCase();
  if (normalizedFilePath.length === 0) {
    return null;
  }

  if (
    normalizedFilePath.endsWith(".md") ||
    normalizedFilePath.endsWith(".mdx") ||
    normalizedFilePath.endsWith(".markdown")
  ) {
    return "markdown";
  }

  if (normalizedFilePath.endsWith(".txt")) {
    return "plain_text";
  }

  return null;
}
