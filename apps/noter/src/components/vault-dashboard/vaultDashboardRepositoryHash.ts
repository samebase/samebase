export function buildVaultDashboardRepositoryHashId(args: {
  hasDuplicateRepositoryName: boolean;
  repositoryFullName: string;
  repositoryName: string;
}): string {
  return args.hasDuplicateRepositoryName
    ? args.repositoryFullName
    : args.repositoryName;
}

export function normalizeVaultDashboardRepositoryHash(
  hash: string,
): string | null {
  const normalizedHash = hash.replace(/^#/, "");
  if (normalizedHash.length === 0) {
    return null;
  }

  try {
    return decodeURIComponent(normalizedHash);
  } catch {
    return normalizedHash;
  }
}
