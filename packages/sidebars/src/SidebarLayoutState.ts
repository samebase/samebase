export type MobilePane = "left" | "main" | "right";
export type SidebarSide = Exclude<MobilePane, "main">;

export type MobileSurface =
  | { kind: "unmerged" }
  | {
      kind: "merged";
      mainWidthPx: number;
      side: SidebarSide;
    };

export type SidebarLayoutState = {
  leftDesktopOpen: boolean;
  leftDesktopWidthPx: number;
  leftMobileWidthPx: number;
  mobilePane: MobilePane;
  mobileSurface: MobileSurface;
  rightDesktopOpen: boolean;
  rightDesktopWidthPx: number;
  rightMobileWidthPx: number;
};

export type SidebarLayoutStatePersistenceMode = "immediate" | "width_deferred";

export type SidebarLayoutStateUpdate = (currentState: SidebarLayoutState) => SidebarLayoutState;

export type SidebarLayoutStateController = {
  isHydrated: boolean;
  state: SidebarLayoutState;
  setState: (
    updateState: SidebarLayoutStateUpdate,
    persistenceMode: SidebarLayoutStatePersistenceMode,
  ) => void;
};
