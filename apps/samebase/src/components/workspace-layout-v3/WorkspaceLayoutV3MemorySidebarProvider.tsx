import { type ReactNode } from "react";
import type { WorkspaceSidebarState } from "../../../convex/userPreferenceModel";
import type { WorkspacePaneSide } from "./WorkspacePaneRuntime";
import { useWorkspaceLayoutV3MemorySidebarController } from "./useWorkspaceLayoutV3MemorySidebarController";
import { WorkspacePaneRuntimeProvider } from "./WorkspacePaneRuntime";

type WorkspaceLayoutV3MemorySidebarProviderProps = {
  children: ReactNode;
  initialState: WorkspaceSidebarState;
  shortcutPaneSide?: WorkspacePaneSide;
};

export function WorkspaceLayoutV3MemorySidebarProvider({
  children,
  initialState,
  shortcutPaneSide,
}: WorkspaceLayoutV3MemorySidebarProviderProps) {
  const controller = useWorkspaceLayoutV3MemorySidebarController(initialState);

  return (
    <WorkspacePaneRuntimeProvider controller={controller} shortcutPaneSide={shortcutPaneSide}>
      {children}
    </WorkspacePaneRuntimeProvider>
  );
}
