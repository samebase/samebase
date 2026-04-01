import {
  buildCodexThreadSidebarViewModel,
  type CodexThreadSidebarViewModel,
} from "@/lib/codexThreadSidebar";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
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
