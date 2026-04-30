const VIDEO_EXTENSIONS = [".m4v", ".mov", ".mp4", ".ogv", ".webm"] as const;

function getUrlPathname(value: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return "";
  }

  try {
    return new URL(trimmedValue, "https://noter.local").pathname.toLowerCase();
  } catch {
    return trimmedValue.split(/[?#]/)[0]?.toLowerCase() ?? "";
  }
}

export function isMarkdownVideoUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  const pathname = getUrlPathname(value);
  return VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}
