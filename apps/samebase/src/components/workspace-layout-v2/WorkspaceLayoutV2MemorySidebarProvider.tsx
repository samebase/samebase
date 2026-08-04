import { type ReactNode } from "react";
import type { WorkspaceSidebarState } from "../../../convex/userPreferenceModel";
import type { WorkspacePaneSide } from "./WorkspacePaneRuntime";
import { useWorkspaceLayoutV2MemorySidebarController } from "./useWorkspaceLayoutV2MemorySidebarController";
import { WorkspacePaneRuntimeProvider } from "./WorkspacePaneRuntime";

type WorkspaceLayoutV2MemorySidebarProviderProps = {
  children: ReactNode;
  initialState: WorkspaceSidebarState;
  shortcutPaneSide?: WorkspacePaneSide | undefined;
};

export function WorkspaceLayoutV2MemorySidebarProvider({
  children,
  initialState,
  shortcutPaneSide,
}: WorkspaceLayoutV2MemorySidebarProviderProps) {
  const controller = useWorkspaceLayoutV2MemorySidebarController(initialState);

  return (
    <WorkspacePaneRuntimeProvider controller={controller} shortcutPaneSide={shortcutPaneSide}>
      {children}
    </WorkspacePaneRuntimeProvider>
  );
}
