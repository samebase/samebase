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

export type RepositoryFullNameParts = {
  owner: string;
  name: string;
};

export function tryParseRepositoryFullName(
  repositoryFullName: string,
): RepositoryFullNameParts | null {
  const parts = repositoryFullName.split("/");
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

export function parseRepositoryFullName(repositoryFullName: string): RepositoryFullNameParts {
  const parts = tryParseRepositoryFullName(repositoryFullName);
  if (parts === null) {
    throw new Error("Invalid repository full name");
  }
  return parts;
}
