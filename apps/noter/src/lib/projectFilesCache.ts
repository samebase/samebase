export interface ProjectFile {
  path: string;
  content: string;
}

interface LoadProjectFilesWithSharedPromiseArgs {
  cacheKey: string;
  load: () => Promise<ProjectFile[]>;
}

const projectFilesCache = new Map<string, ProjectFile[]>();
const pendingFetches = new Map<string, Promise<ProjectFile[]>>();

export function getCachedProjectFiles(cacheKey: string): ProjectFile[] | null {
  return projectFilesCache.get(cacheKey) ?? null;
}

export function loadProjectFilesWithSharedPromise(
  args: LoadProjectFilesWithSharedPromiseArgs,
): Promise<ProjectFile[]> {
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
      projectFilesCache.set(args.cacheKey, result);
      return result;
    })
    .finally(() => {
      pendingFetches.delete(args.cacheKey);
    });

  pendingFetches.set(args.cacheKey, inFlight);
  return inFlight;
}

export function clearProjectFilesCacheForTests(): void {
  projectFilesCache.clear();
  pendingFetches.clear();
}
