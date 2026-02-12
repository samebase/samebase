export const toSafeRepoName = (rawName: string): string => {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.]+|[.]+$/g, "");

  return /[a-zA-Z0-9]/.test(normalized) ? normalized : "";
};
