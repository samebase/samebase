import { type ReactNode } from "react";
import type { SidebarSide } from "@/hooks/use-sidebar";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import { useWorkspaceLayoutV2MemorySidebarController } from "./useWorkspaceLayoutV2MemorySidebarController";
import { WorkspaceLayoutSidebarProvider } from "./WorkspaceLayoutSidebarProvider";

type WorkspaceLayoutV2MemorySidebarProviderProps = {
  children: ReactNode;
  initialState: WorkspaceSidebarState;
  shortcutSidebarSide?: SidebarSide;
};

export function WorkspaceLayoutV2MemorySidebarProvider({
  children,
  initialState,
  shortcutSidebarSide,
}: WorkspaceLayoutV2MemorySidebarProviderProps) {
  const controller = useWorkspaceLayoutV2MemorySidebarController(initialState);

  return (
    <WorkspaceLayoutSidebarProvider
      controller={controller}
      shortcutSidebarSide={shortcutSidebarSide}
    >
      {children}
    </WorkspaceLayoutSidebarProvider>
  );
}
