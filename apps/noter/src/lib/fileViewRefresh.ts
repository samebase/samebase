export interface FileViewRefreshArgs {
  owner: string;
  repoName: string;
  branch?: string;
}

export function buildFileViewRefreshDebounceKey(
  args: FileViewRefreshArgs,
): string {
  return `${args.owner}/${args.repoName}:${args.branch ?? "__default__"}`;
}
