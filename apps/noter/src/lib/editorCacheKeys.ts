export function buildMonacoAppliedCacheKey(args: {
  vaultId: string;
  branch: string;
  treeSHA: string;
  scopePrefix: string;
}): string {
  return `${args.vaultId}:${args.branch}:${args.treeSHA}:${args.scopePrefix}`;
}

export function buildProjectFilesCacheKey(args: {
  vaultId: string;
  branch: string;
  treeSHA: string;
  scopePrefix: string;
}): string {
  return `${args.vaultId}:${args.branch}:${args.treeSHA}:${args.scopePrefix}`;
}
