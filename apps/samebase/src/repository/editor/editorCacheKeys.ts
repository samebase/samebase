export function buildMonacoAppliedCacheKey(args: {
  repositoryId: string;
  branch: string;
  treeSHA: string;
  scopePrefix: string;
}): string {
  return `${args.repositoryId}:${args.branch}:${args.treeSHA}:${args.scopePrefix}`;
}
