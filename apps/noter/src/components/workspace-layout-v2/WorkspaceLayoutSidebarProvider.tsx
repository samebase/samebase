import type { ComponentProps } from "react";
import { SidebarProvider } from "@/components/sidebar";
import type { WorkspaceSidebarStateController } from "@/lib/workspaceSidebarStateController";

type WorkspaceLayoutSidebarProviderProps = Omit<
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
  state: WorkspaceSidebarStateController;
};

/**
 * Bridges the workspace sidebar controller into the current SidebarProvider
 * API. Storage adapters choose where the controller is persisted; this layer
 * only exposes that controller to workspace layout consumers.
 */
export function WorkspaceLayoutSidebarProvider({
  state,
  ...props
}: WorkspaceLayoutSidebarProviderProps) {
  if (!state.isHydrated) {
    return null;
  }

  return (
    <SidebarProvider
      {...props}
      leftOpen={state.leftDesktopOpen}
      onLeftOpenChange={state.setLeftDesktopOpen}
      rightOpen={state.rightDesktopOpen}
      onRightOpenChange={state.setRightDesktopOpen}
      leftDesktopWidthPx={state.leftDesktopWidthPx}
      onLeftDesktopWidthPxChange={state.setLeftDesktopWidthPx}
      rightDesktopWidthPx={state.rightDesktopWidthPx}
      onRightDesktopWidthPxChange={state.setRightDesktopWidthPx}
      leftMobileWidthPx={state.leftMobileWidthPx}
      onLeftMobileWidthPxChange={state.setLeftMobileWidthPx}
      rightMobileWidthPx={state.rightMobileWidthPx}
      onRightMobileWidthPxChange={state.setRightMobileWidthPx}
      mobilePane={state.mobilePane}
      onMobilePaneChange={state.setMobilePane}
    />
  );
}
