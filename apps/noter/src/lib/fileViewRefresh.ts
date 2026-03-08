export function buildFileViewRefreshDebounceKey(args: {
  owner: string;
  repoName: string;
  branch?: string;
}): string {
  return `${args.owner}/${args.repoName}:${args.branch ?? "__default__"}`;
}
