export function buildVaultDashboardRepositoryHashId(args: {
  appRoot: string;
  hasDuplicateRepositoryName: boolean;
  repositoryFullName: string;
  repositoryName: string;
}): string {
  if (args.appRoot !== ".") {
    return `${args.repositoryFullName}:${args.appRoot}`;
  }
  return args.hasDuplicateRepositoryName ? args.repositoryFullName : args.repositoryName;
}

export function buildVaultDashboardRepositoryHashHref(hashId: string): string {
  return `#${encodeURI(hashId)}`;
}

export function normalizeVaultDashboardRepositoryHash(hash: string): string | null {
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
