export interface ProjectFile {
  path: string;
  content: string;
}

export interface ProjectFilesCacheScope {
  vaultId: string;
  branch: string;
  treeSHA: string;
}

interface LoadProjectFilesWithSharedPromiseArgs {
  cacheKey: string;
  scope: ProjectFilesCacheScope;
  load: () => Promise<ProjectFile[]>;
}

const projectFilesCache = new Map<string, ProjectFile[]>();
const projectFilesCacheScopes = new Map<string, ProjectFilesCacheScope>();
const pendingFetches = new Map<string, Promise<ProjectFile[]>>();
const pendingFetchScopes = new Map<string, ProjectFilesCacheScope>();

function isSameVaultBranch(left: ProjectFilesCacheScope, right: ProjectFilesCacheScope): boolean {
  return left.vaultId === right.vaultId && left.branch === right.branch;
}

function pruneHistoricalSnapshots(
  activeScope: ProjectFilesCacheScope,
  activeCacheKey: string,
): void {
  for (const [cacheKey, cacheScope] of projectFilesCacheScopes) {
    if (
      cacheKey !== activeCacheKey &&
      isSameVaultBranch(cacheScope, activeScope) &&
      cacheScope.treeSHA !== activeScope.treeSHA
    ) {
      projectFilesCache.delete(cacheKey);
      projectFilesCacheScopes.delete(cacheKey);
      pendingFetches.delete(cacheKey);
      pendingFetchScopes.delete(cacheKey);
    }
  }

  for (const [cacheKey, cacheScope] of pendingFetchScopes) {
    if (
      cacheKey !== activeCacheKey &&
      isSameVaultBranch(cacheScope, activeScope) &&
      cacheScope.treeSHA !== activeScope.treeSHA
    ) {
      pendingFetches.delete(cacheKey);
      pendingFetchScopes.delete(cacheKey);
    }
  }
}

export function getCachedProjectFiles(cacheKey: string): ProjectFile[] | null {
  return projectFilesCache.get(cacheKey) ?? null;
}

export function loadProjectFilesWithSharedPromise(
  args: LoadProjectFilesWithSharedPromiseArgs,
): Promise<ProjectFile[]> {
  pruneHistoricalSnapshots(args.scope, args.cacheKey);

  const cached = projectFilesCache.get(args.cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingFetches.get(args.cacheKey);
  if (pending) {
    return pending;
  }

  const inFlight = args
    .load()
    .then((result) => {
      const activePendingPromise = pendingFetches.get(args.cacheKey);
      const activePendingScope = pendingFetchScopes.get(args.cacheKey);
      const canWriteCache =
        activePendingPromise === inFlight &&
        activePendingScope !== undefined &&
        activePendingScope.vaultId === args.scope.vaultId &&
        activePendingScope.branch === args.scope.branch &&
        activePendingScope.treeSHA === args.scope.treeSHA;

      if (canWriteCache) {
        projectFilesCache.set(args.cacheKey, result);
        projectFilesCacheScopes.set(args.cacheKey, args.scope);
      }
      return result;
    })
    .finally(() => {
      if (pendingFetches.get(args.cacheKey) === inFlight) {
        pendingFetches.delete(args.cacheKey);
      }
      if (pendingFetchScopes.get(args.cacheKey)?.treeSHA === args.scope.treeSHA) {
        pendingFetchScopes.delete(args.cacheKey);
      }
    });

  pendingFetches.set(args.cacheKey, inFlight);
  pendingFetchScopes.set(args.cacheKey, args.scope);
  return inFlight;
}

export function clearProjectFilesCacheForTests(): void {
  projectFilesCache.clear();
  projectFilesCacheScopes.clear();
  pendingFetches.clear();
  pendingFetchScopes.clear();
}
