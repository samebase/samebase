export const VAULT_ROOT_DIRECTORY = "/";

const INVALID_ROOT_DIRECTORY_MESSAGE = "Root directory must be / or a repository-relative path.";

export function normalizeVaultRootDirectory(value: string): string {
  const rootDirectory = value.trim();
  if (!rootDirectory) {
    throw new Error("Root directory is required.");
  }
  if (rootDirectory === VAULT_ROOT_DIRECTORY) {
    return VAULT_ROOT_DIRECTORY;
  }
  if (
    /^[A-Za-z]:[\\/]/.test(rootDirectory) ||
    rootDirectory.startsWith("/") ||
    rootDirectory.includes("\\")
  ) {
    throw new Error(INVALID_ROOT_DIRECTORY_MESSAGE);
  }

  const segments = rootDirectory.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(INVALID_ROOT_DIRECTORY_MESSAGE);
  }

  return segments.join("/");
}
