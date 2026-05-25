export const ROOT_CLOUDFLARE_APP_ROOT = ".";

export function normalizeCloudflareAppRoot(value: string): string {
  const trimmed = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    throw new Error("App root is required.");
  }
  if (trimmed === ROOT_CLOUDFLARE_APP_ROOT) {
    return ROOT_CLOUDFLARE_APP_ROOT;
  }
  const segments = trimmed.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("App root must be a repository-relative path.");
  }
  return segments.join("/");
}
