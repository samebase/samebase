type VaultConvexProjectAttachmentLookupRow = {
  repositoryFullName: string;
  convexProjects: readonly {
    convexProjectId: string;
  }[];
};

export function findVaultConvexProjectAttachment<
  Vault extends VaultConvexProjectAttachmentLookupRow,
>(
  vaults: readonly Vault[],
  repositoryFullName: string,
  convexProjectId: string,
): {
  vault: Vault;
  project: Vault["convexProjects"][number] | null;
} | null {
  const vault = vaults.find((candidate) => candidate.repositoryFullName === repositoryFullName);
  if (!vault) {
    return null;
  }

  return {
    vault,
    project:
      vault.convexProjects.find((project) => project.convexProjectId === convexProjectId) ?? null,
  };
}
