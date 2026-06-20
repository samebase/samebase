import { notEmpty } from "@samebase/dependent";
import { type CodexAppServerThread } from "@/codex/appServerResearch";

export type CodexThreadSidebarThread = {
  id: string;
  isLoaded: boolean;
  isPinned: boolean;
  showWorkspaceIndicator: boolean;
  title: string;
  thread: CodexAppServerThread;
  workspaceLabel: string | null;
  workspaceTooltip: string | null;
};

export type CodexThreadSidebarProject = {
  count: number;
  detail: string;
  id: string;
  label: string;
  latestUpdatedAt: number;
  loadedCount: number;
  rootCwd: string;
  threads: CodexThreadSidebarThread[];
};

export type CodexThreadSidebarViewModel = {
  pinnedThreads: CodexThreadSidebarThread[];
  projects: CodexThreadSidebarProject[];
  uniqueThreads: CodexAppServerThread[];
};

function readFirstNonEmptyLine(value: string): string {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? value.trim();
}

function readThreadTitle(thread: CodexAppServerThread): string {
  const explicitName = thread.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  return readFirstNonEmptyLine(thread.preview);
}

function readProjectLabel(thread: CodexAppServerThread): string {
  const explicitLabel = thread.project.label.trim();
  if (explicitLabel.length > 0) {
    return explicitLabel;
  }

  const pathParts = thread.project.rootCwd.split(/[\\/]+/).filter((part) => part.length > 0);
  return pathParts.at(-1) ?? thread.project.rootCwd;
}

/**
 * The provider inventory can contain repeated snapshots of the same thread.
 * Keep the freshest copy so every consumer starts from one stable thread list.
 */
export function dedupeCodexThreadsById(threads: CodexAppServerThread[]): CodexAppServerThread[] {
  const threadsById = new Map<string, CodexAppServerThread>();

  for (const thread of threads) {
    const current = threadsById.get(thread.id);
    if (!current || thread.updatedAt > current.updatedAt) {
      threadsById.set(thread.id, thread);
    }
  }

  return Array.from(threadsById.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}

function buildSidebarThread(args: {
  loadedThreadIds: Set<string>;
  pinnedThreadIds: Set<string>;
  thread: CodexAppServerThread;
}): CodexThreadSidebarThread {
  const workspaceLabel = args.thread.workspace.isProjectRoot ? null : args.thread.workspace.label;

  return {
    id: args.thread.id,
    isLoaded: args.loadedThreadIds.has(args.thread.id),
    isPinned: args.pinnedThreadIds.has(args.thread.id),
    showWorkspaceIndicator: !args.thread.workspace.isProjectRoot,
    title: readThreadTitle(args.thread),
    thread: args.thread,
    workspaceLabel,
    workspaceTooltip: args.thread.workspace.isProjectRoot
      ? null
      : (workspaceLabel ?? args.thread.cwd),
  };
}

/**
 * Keep the view model close to Codex's own project/workspace metadata so UI
 * consumers share one thin translation layer instead of baking route-specific
 * grouping rules into separate components.
 */
export function buildCodexThreadSidebarViewModel(args: {
  loadedThreadIds?: string[];
  pinnedThreadIds: string[];
  threads: CodexAppServerThread[];
}): CodexThreadSidebarViewModel {
  const uniqueThreads = dedupeCodexThreadsById(args.threads);
  const loadedThreadIds = new Set(args.loadedThreadIds ?? []);
  const pinnedThreadIds = new Set(args.pinnedThreadIds);
  const threadById = new Map(uniqueThreads.map((thread) => [thread.id, thread] as const));
  const projectMap = new Map<string, CodexThreadSidebarProject>();

  const pinnedThreads = args.pinnedThreadIds
    .map((threadId) => threadById.get(threadId))
    .filter(notEmpty)
    .map((thread) =>
      buildSidebarThread({
        loadedThreadIds,
        pinnedThreadIds,
        thread,
      }),
    );

  for (const thread of uniqueThreads) {
    if (pinnedThreadIds.has(thread.id)) {
      continue;
    }

    const sidebarThread = buildSidebarThread({
      loadedThreadIds,
      pinnedThreadIds,
      thread,
    });
    const current = projectMap.get(thread.project.id);

    if (current) {
      current.count += 1;
      current.loadedCount += sidebarThread.isLoaded ? 1 : 0;
      current.latestUpdatedAt = Math.max(current.latestUpdatedAt, thread.updatedAt);
      current.threads.push(sidebarThread);
      continue;
    }

    projectMap.set(thread.project.id, {
      count: 1,
      detail: thread.project.rootCwd,
      id: thread.project.id,
      label: readProjectLabel(thread),
      latestUpdatedAt: thread.updatedAt,
      loadedCount: sidebarThread.isLoaded ? 1 : 0,
      rootCwd: thread.project.rootCwd,
      threads: [sidebarThread],
    });
  }

  const projects = Array.from(projectMap.values())
    .sort((left, right) => right.latestUpdatedAt - left.latestUpdatedAt)
    .map((project) => ({
      ...project,
      threads: project.threads.sort(
        (left, right) => right.thread.updatedAt - left.thread.updatedAt,
      ),
    }));

  return {
    pinnedThreads,
    projects,
    uniqueThreads,
  };
}
