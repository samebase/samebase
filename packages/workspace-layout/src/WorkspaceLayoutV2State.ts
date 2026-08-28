export type WorkspaceMobilePane = "left" | "main" | "right";
export type WorkspacePaneSide = Exclude<WorkspaceMobilePane, "main">;

export type WorkspaceMobileSurface =
  | { kind: "unmerged" }
  | {
      kind: "merged";
      mainWidthPx: number;
      side: WorkspacePaneSide;
    };

export type WorkspaceSidebarState = {
  leftDesktopOpen: boolean;
  leftDesktopWidthPx: number;
  leftMobileWidthPx: number;
  mobilePane: WorkspaceMobilePane;
  mobileSurface: WorkspaceMobileSurface;
  rightDesktopOpen: boolean;
  rightDesktopWidthPx: number;
  rightMobileWidthPx: number;
};

export type WorkspaceSidebarStatePersistenceMode = "immediate" | "width_deferred";

export type WorkspaceSidebarStateUpdate = (
  currentState: WorkspaceSidebarState,
) => WorkspaceSidebarState;

export type WorkspaceSidebarStateController = {
  isHydrated: boolean;
  state: WorkspaceSidebarState;
  setState: (
    updateState: WorkspaceSidebarStateUpdate,
    persistenceMode: WorkspaceSidebarStatePersistenceMode,
  ) => void;
};
