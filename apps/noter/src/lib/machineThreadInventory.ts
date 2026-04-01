import { type CodexAppServerThread } from "@/lib/codexAppServerResearch";

export type MachineThreadGroup = {
  id: string;
  label: string;
  detail: string;
  count: number;
  loadedCount: number;
  latestUpdatedAt: number;
  threads: CodexAppServerThread[];
};

export function dedupeMachineThreadsById(
  threads: CodexAppServerThread[],
): CodexAppServerThread[] {
  const threadsById = new Map<string, CodexAppServerThread>();

  for (const thread of threads) {
    const current = threadsById.get(thread.id);
    if (!current || thread.updatedAt > current.updatedAt) {
      threadsById.set(thread.id, thread);
    }
  }

  return Array.from(threadsById.values()).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

/**
 * Keep the search behavior aligned with the existing live-control surface so
 * the new `/machines` workspace can find threads by the same inventory cues.
 */
export function filterMachineThreadsBySearch(args: {
  searchTerm: string;
  threads: CodexAppServerThread[];
}): CodexAppServerThread[] {
  const trimmedSearch = args.searchTerm.trim().toLowerCase();

  return args.threads.filter((thread) => {
    if (trimmedSearch.length === 0) {
      return true;
    }

    const haystack = [
      thread.id,
      thread.name ?? "",
      thread.preview,
      thread.cwd,
      thread.path ?? "",
      thread.project.rootCwd,
      thread.workspace.label ?? "",
      thread.gitInfo?.branch ?? "",
    ]
      .join("\n")
      .toLowerCase();

    return haystack.includes(trimmedSearch);
  });
}

export function buildMachineThreadGroups(args: {
  loadedThreadIds: string[];
  threads: CodexAppServerThread[];
}): MachineThreadGroup[] {
  const groupMap = new Map<string, MachineThreadGroup>();
  const loadedThreadIdSet = new Set(args.loadedThreadIds);

  for (const thread of args.threads) {
    const current = groupMap.get(thread.project.id);
    const loadedCountDelta = loadedThreadIdSet.has(thread.id) ? 1 : 0;

    if (current) {
      current.count += 1;
      current.loadedCount += loadedCountDelta;
      current.latestUpdatedAt = Math.max(
        current.latestUpdatedAt,
        thread.updatedAt,
      );
      current.threads.push(thread);
      continue;
    }

    groupMap.set(thread.project.id, {
      count: 1,
      detail: thread.project.rootCwd,
      id: thread.project.id,
      label: thread.project.label,
      latestUpdatedAt: thread.updatedAt,
      loadedCount: loadedCountDelta,
      threads: [thread],
    });
  }

  return Array.from(groupMap.values())
    .sort((left, right) => right.latestUpdatedAt - left.latestUpdatedAt)
    .map((group) => ({
      ...group,
      threads: group.threads.sort(
        (left, right) => right.updatedAt - left.updatedAt,
      ),
    }));
}
