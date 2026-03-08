export interface FileViewRefreshArgs {
  owner: string;
  repoName: string;
  branch?: string;
}

export function buildFileViewRefreshDebounceKey(
  args: FileViewRefreshArgs,
): string {
  if (args.branch === undefined) {
    return `${args.owner}/${args.repoName}:default`;
  }

  return `${args.owner}/${args.repoName}:branch:${args.branch}`;
}
