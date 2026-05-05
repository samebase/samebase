import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

export type WorkspaceSidebarStateController = WorkspaceSidebarState & {
  isHydrated: boolean;
  setLeftDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setLeftDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setLeftMobileWidthPx: Dispatch<SetStateAction<number>>;
  setMobilePane: Dispatch<SetStateAction<WorkspaceSidebarState["mobilePane"]>>;
  setRightDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setRightDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setRightMobileWidthPx: Dispatch<SetStateAction<number>>;
};
