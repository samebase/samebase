import { type ReactNode } from "react";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import type { WorkspacePaneSide } from "./WorkspacePaneRuntime";
import { useWorkspaceLayoutV2MemorySidebarController } from "./useWorkspaceLayoutV2MemorySidebarController";
import { WorkspaceLayoutSidebarProvider } from "./WorkspaceLayoutSidebarProvider";

type WorkspaceLayoutV2MemorySidebarProviderProps = {
  children: ReactNode;
  initialState: WorkspaceSidebarState;
  shortcutPaneSide?: WorkspacePaneSide;
};

export function WorkspaceLayoutV2MemorySidebarProvider({
  children,
  initialState,
  shortcutPaneSide,
}: WorkspaceLayoutV2MemorySidebarProviderProps) {
  const controller = useWorkspaceLayoutV2MemorySidebarController(initialState);

  return (
    <WorkspaceLayoutSidebarProvider
      controller={controller}
      shortcutPaneSide={shortcutPaneSide}
    >
      {children}
    </WorkspaceLayoutSidebarProvider>
  );
}
