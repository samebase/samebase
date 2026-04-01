import * as React from "react";

export type SidebarSide = "left" | "right";
export type MobileSidebarPane = SidebarSide | "main";

export type SidebarContextProps = {
  isMobile: boolean;
  leftDesktopOpen: boolean;
  leftDesktopWidthPx: number;
  leftMobileWidthPx: number;
  setLeftDesktopOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLeftDesktopWidthPx: React.Dispatch<React.SetStateAction<number>>;
  setLeftMobileWidthPx: React.Dispatch<React.SetStateAction<number>>;
  rightDesktopOpen: boolean;
  rightDesktopWidthPx: number;
  rightMobileWidthPx: number;
  setRightDesktopOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightDesktopWidthPx: React.Dispatch<React.SetStateAction<number>>;
  setRightMobileWidthPx: React.Dispatch<React.SetStateAction<number>>;
  mobilePane: MobileSidebarPane;
  setMobilePane: React.Dispatch<React.SetStateAction<MobileSidebarPane>>;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

export const SidebarContext = React.createContext<SidebarContextProps | null>(
  null,
);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}
