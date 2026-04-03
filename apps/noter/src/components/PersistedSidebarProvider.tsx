import type { ComponentProps } from "react";
import { SidebarProvider } from "@/components/sidebar";
import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";
import type {
  WorkspaceSidebarState,
  WorkspaceSidebarStateKey,
} from "../../convex/workspaceSidebarStateModel";

type PersistedSidebarProviderProps = Omit<
  ComponentProps<typeof SidebarProvider>,
  | "defaultLeftDesktopWidthPx"
  | "defaultLeftMobileWidthPx"
  | "defaultOpen"
  | "defaultRightDesktopWidthPx"
  | "defaultRightMobileWidthPx"
  | "defaultRightOpen"
  | "leftDesktopWidthPx"
  | "leftOpen"
  | "leftMobileWidthPx"
  | "mobilePane"
  | "onLeftDesktopWidthPxChange"
  | "onLeftOpenChange"
  | "onLeftMobileWidthPxChange"
  | "onMobilePaneChange"
  | "onOpenChange"
  | "onRightDesktopWidthPxChange"
  | "onRightMobileWidthPxChange"
  | "onRightOpenChange"
  | "open"
  | "rightDesktopWidthPx"
  | "rightOpen"
  | "rightMobileWidthPx"
> & {
  defaultState: WorkspaceSidebarState;
  workspaceKey: WorkspaceSidebarStateKey;
};

export function PersistedSidebarProvider({
  defaultState,
  workspaceKey,
  ...props
}: PersistedSidebarProviderProps) {
  const sidebarState = usePersistedWorkspaceSidebarState({
    defaults: defaultState,
    workspaceKey,
  });

  return (
    <SidebarProvider
      {...props}
      leftOpen={sidebarState.leftDesktopOpen}
      onLeftOpenChange={sidebarState.setLeftDesktopOpen}
      rightOpen={sidebarState.rightDesktopOpen}
      onRightOpenChange={sidebarState.setRightDesktopOpen}
      leftDesktopWidthPx={sidebarState.leftDesktopWidthPx}
      onLeftDesktopWidthPxChange={sidebarState.setLeftDesktopWidthPx}
      rightDesktopWidthPx={sidebarState.rightDesktopWidthPx}
      onRightDesktopWidthPxChange={sidebarState.setRightDesktopWidthPx}
      leftMobileWidthPx={sidebarState.leftMobileWidthPx}
      onLeftMobileWidthPxChange={sidebarState.setLeftMobileWidthPx}
      rightMobileWidthPx={sidebarState.rightMobileWidthPx}
      onRightMobileWidthPxChange={sidebarState.setRightMobileWidthPx}
      mobilePane={sidebarState.mobilePane}
      onMobilePaneChange={sidebarState.setMobilePane}
    />
  );
}
