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
}): T[] {
  if (!args.githubConnected) {
    return [];
  }

  if (args.repositoryPreview?.hasMore === false) {
    return args.repositoryPreview.repositories;
  }

  return args.fullRepositories ?? args.repositoryPreview?.repositories ?? [];
}
