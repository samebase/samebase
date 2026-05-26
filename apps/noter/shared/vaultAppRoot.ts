export const ROOT_VAULT_APP_ROOT = ".";

export function normalizeVaultAppRoot(value: string): string {
  const raw = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("//")) {
    throw new Error("App root must be a repository-relative path.");
  }
  const trimmed = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    throw new Error("App root is required.");
  }
  if (trimmed === ROOT_VAULT_APP_ROOT) {
    return ROOT_VAULT_APP_ROOT;
  }
  const segments = trimmed.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("App root must be a repository-relative path.");
  }
  return segments.join("/");
}
