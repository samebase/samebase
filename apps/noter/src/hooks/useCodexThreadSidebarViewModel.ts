import {
  buildCodexThreadSidebarViewModel,
  type CodexThreadSidebarViewModel,
} from "#src/lib/codexThreadSidebar.ts";
import type { CodexAppServerThread } from "#src/lib/codexAppServerResearch.ts";
import { useMemo } from "react";

export function useCodexThreadSidebarViewModel(args: {
  loadedThreadIds?: string[];
  pinnedThreadIds: string[];
  threads: CodexAppServerThread[];
}): CodexThreadSidebarViewModel {
  const { loadedThreadIds, pinnedThreadIds, threads } = args;

  return useMemo(
    () =>
      buildCodexThreadSidebarViewModel({
        loadedThreadIds,
        pinnedThreadIds,
        threads,
      }),
    [loadedThreadIds, pinnedThreadIds, threads],
  );
}
