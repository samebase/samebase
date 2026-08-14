/**
 * The preview becomes the source of truth when GitHub reports there is no next
 * page, even if React Query still has a stale full-scan cache entry around.
 */
export function resolveDisplayedRepositories<T>(args: {
  githubConnected: boolean;
  repositoryPreview:
    | {
        repositories: T[];
        hasMore: boolean;
      }
    | undefined;
  fullRepositories: T[] | undefined;
  hasFreshFullRepositories: boolean;
}): T[] {
  if (!args.githubConnected) {
    return [];
  }

  if (args.repositoryPreview?.hasMore === false) {
    return args.repositoryPreview.repositories;
  }

  if (args.hasFreshFullRepositories) {
    return args.fullRepositories ?? args.repositoryPreview?.repositories ?? [];
  }

  return args.repositoryPreview?.repositories ?? [];
}

export function isGitHubRepositoryConnected(args: {
  repository: { id: number; full_name: string };
  vaults: readonly { ghRepoId?: string; repositoryFullName: string }[];
}): boolean {
  const repositoryId = String(args.repository.id);
  return args.vaults.some(
    (vault) =>
      vault.ghRepoId === repositoryId || vault.repositoryFullName === args.repository.full_name,
  );
}
