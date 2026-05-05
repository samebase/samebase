import { useCallback, type ComponentProps, type SetStateAction } from "react";
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

function resolveNextState<T>(currentValue: T, nextValue: SetStateAction<T>) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
}

/**
 * Adapts SidebarProvider's field-level setters into the workspace controller's
 * whole-state update while preserving React-style updater functions.
 */
function getNextWorkspaceSidebarState<Key extends keyof WorkspaceSidebarState>(
  state: WorkspaceSidebarState,
  key: Key,
  nextValue: SetStateAction<WorkspaceSidebarState[Key]>,
) {
  const nextFieldValue = resolveNextState(state[key], nextValue);
  if (state[key] === nextFieldValue) {
    return state;
  }

  const nextState = { ...state };
  nextState[key] = nextFieldValue;
  return nextState;
}

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
      nextValue: SetStateAction<WorkspaceSidebarState[Key]>,
      persistenceMode: WorkspaceSidebarStatePersistenceMode,
    ) => {
      setControllerState(
        (state) => getNextWorkspaceSidebarState(state, key, nextValue),
        persistenceMode,
      );
    },
    [setControllerState],
  );
  const setLeftDesktopOpen = useCallback(
    (nextOpen: SetStateAction<boolean>) => {
      updateSidebarState("leftDesktopOpen", nextOpen, "immediate");
    },
    [updateSidebarState],
  );
  const setRightDesktopOpen = useCallback(
    (nextOpen: SetStateAction<boolean>) => {
      updateSidebarState("rightDesktopOpen", nextOpen, "immediate");
    },
    [updateSidebarState],
  );
  const setLeftDesktopWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updateSidebarState("leftDesktopWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setRightDesktopWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updateSidebarState("rightDesktopWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setLeftMobileWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updateSidebarState("leftMobileWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setRightMobileWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updateSidebarState("rightMobileWidthPx", nextWidthPx, "width_deferred");
    },
    [updateSidebarState],
  );
  const setMobilePane = useCallback(
    (nextPane: SetStateAction<WorkspaceSidebarState["mobilePane"]>) => {
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
