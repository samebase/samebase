import { useCallback, type ComponentProps } from "react";
import { SidebarProvider } from "@/components/sidebar";
import type {
  WorkspaceSidebarStateController,
  WorkspaceSidebarStatePersistenceMode,
} from "@/lib/workspaceSidebarStateController";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";

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
  controller: WorkspaceSidebarStateController;
};

/**
 * Bridges the workspace sidebar controller into the current SidebarProvider
 * API. Storage adapters choose where the controller is persisted; this layer
 * only exposes that controller to workspace layout consumers.
 */
export function WorkspaceLayoutSidebarProvider({
  controller,
  ...props
}: WorkspaceLayoutSidebarProviderProps) {
  const setControllerState = controller.setState;
  const updateSidebarState = useCallback(
    <Key extends keyof WorkspaceSidebarState>(
      key: Key,
      nextValue: WorkspaceSidebarState[Key],
      persistenceMode: WorkspaceSidebarStatePersistenceMode,
    ) => {
      setControllerState((state) => {
        if (state[key] === nextValue) {
          return state;
        }

        const nextState = { ...state };
        nextState[key] = nextValue;
        return nextState;
      }, persistenceMode);
    },
    [setControllerState],
  );
  const setLeftDesktopOpen = useCallback(
    (nextOpen: boolean) => {
      updateSidebarState("leftDesktopOpen", nextOpen, "immediate");
    },
    [updateSidebarState],
  );
  const setRightDesktopOpen = useCallback(
    (nextOpen: boolean) => {
      updateSidebarState("rightDesktopOpen", nextOpen, "immediate");
    },
    [updateSidebarState],
  );
  const setLeftDesktopWidthPx = useCallback(
    (nextWidthPx: number) => {
      updateSidebarState("leftDesktopWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setRightDesktopWidthPx = useCallback(
    (nextWidthPx: number) => {
      updateSidebarState("rightDesktopWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setLeftMobileWidthPx = useCallback(
    (nextWidthPx: number) => {
      updateSidebarState("leftMobileWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setRightMobileWidthPx = useCallback(
    (nextWidthPx: number) => {
      updateSidebarState("rightMobileWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setMobilePane = useCallback(
    (nextPane: WorkspaceSidebarState["mobilePane"]) => {
      updateSidebarState("mobilePane", nextPane, "immediate");
    },
    [updateSidebarState],
  );

  if (!controller.isHydrated) {
    return null;
  }

  return (
    <SidebarProvider
      {...props}
      leftOpen={controller.state.leftDesktopOpen}
      onLeftOpenChange={setLeftDesktopOpen}
      rightOpen={controller.state.rightDesktopOpen}
      onRightOpenChange={setRightDesktopOpen}
      leftDesktopWidthPx={controller.state.leftDesktopWidthPx}
      onLeftDesktopWidthPxChange={setLeftDesktopWidthPx}
      rightDesktopWidthPx={controller.state.rightDesktopWidthPx}
      onRightDesktopWidthPxChange={setRightDesktopWidthPx}
      leftMobileWidthPx={controller.state.leftMobileWidthPx}
      onLeftMobileWidthPxChange={setLeftMobileWidthPx}
      rightMobileWidthPx={controller.state.rightMobileWidthPx}
      onRightMobileWidthPxChange={setRightMobileWidthPx}
      mobilePane={controller.state.mobilePane}
      onMobilePaneChange={setMobilePane}
    />
  );
}
