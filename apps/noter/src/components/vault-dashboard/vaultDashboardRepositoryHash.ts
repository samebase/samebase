export function buildVaultDashboardRepositoryHashId(
  repositoryFullName: string,
): string {
  return `vault-${encodeURIComponent(repositoryFullName).replace(/%/g, "~")}`;
}

export function normalizeVaultDashboardRepositoryHash(
  hash: string,
): string | null {
  const normalizedHash = hash.replace(/^#/, "");
  return normalizedHash.startsWith("vault-") ? normalizedHash : null;
}
