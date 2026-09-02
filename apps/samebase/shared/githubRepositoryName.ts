export const toSafeGitHubRepositoryName = (rawGitHubRepositoryName: string): string => {
  const trimmed = rawGitHubRepositoryName.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.]+|[.]+$/g, "");

  return /[a-zA-Z0-9]/.test(normalized) ? normalized : "";
};

export type GitHubRepositoryFullNameParts = {
  owner: string;
  name: string;
};

export function tryParseGitHubRepositoryFullName(
  githubRepositoryFullName: string,
): GitHubRepositoryFullNameParts | null {
  const parts = githubRepositoryFullName.split("/");
  if (parts.length !== 2) {
    return null;
  }
  const owner = parts[0].trim();
  const name = parts[1].trim();
  if (!owner || !name) {
    return null;
  }
  return { owner, name };
}

export function parseGitHubRepositoryFullName(
  githubRepositoryFullName: string,
): GitHubRepositoryFullNameParts {
  const parts = tryParseGitHubRepositoryFullName(githubRepositoryFullName);
  if (parts === null) {
    throw new Error("Invalid repository full name");
  }
  return parts;
}
