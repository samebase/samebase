import { guard } from "@samebase/dependent";

const VIDEO_EXTENSIONS = [".m4v", ".mov", ".mp4", ".ogv", ".webm"] as const;

function getUrlPathname(value: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return "";
  }

  try {
    return new URL(trimmedValue, "https://samebase.local").pathname.toLowerCase();
  } catch {
    return trimmedValue.split(/[?#]/)[0]?.toLowerCase() ?? "";
  }
}

export const isMarkdownVideoUrl = guard<string | undefined, string>((value) => {
  if (!value) {
    return null;
  }

  const pathname = getUrlPathname(value);
  return VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension)) ? value : null;
});
