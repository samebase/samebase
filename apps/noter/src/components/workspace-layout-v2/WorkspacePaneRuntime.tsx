import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ElementSize } from "@/hooks/useElementSize";
import type {
  WorkspaceSidebarStateController,
  WorkspaceSidebarStatePersistenceMode,
} from "@/lib/workspaceSidebarStateController";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import {
  WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP,
  WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE,
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2MobileGrip,
} from "./WorkspaceLayoutV2Geometry";

const WORKSPACE_PANE_KEYBOARD_SHORTCUT = "b";

export type WorkspaceMobilePane = WorkspaceSidebarState["mobilePane"];
export type WorkspacePaneSide = Exclude<WorkspaceMobilePane, "main">;

export type WorkspacePaneState = WorkspaceSidebarState & {
  isMobile: boolean;
};

export type WorkspacePaneActions = {
  setLeftDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setLeftDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setLeftMobileWidthPx: Dispatch<SetStateAction<number>>;
  setMobilePane: Dispatch<SetStateAction<WorkspaceMobilePane>>;
  setMobileSurface: Dispatch<
    SetStateAction<WorkspaceSidebarState["mobileSurface"]>
  >;
  setRightDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setRightDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setRightMobileWidthPx: Dispatch<SetStateAction<number>>;
  settleMobileMergedSurface: (args: {
    mainWidthPx: number;
    side: WorkspacePaneSide;
    sideWidthPx: number;
  }) => void;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
};

export type WorkspaceLayoutV2LocalStoreState = {
  activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
  mobile: {
    grip: WorkspaceLayoutV2MobileGrip;
    isPaneSettled: boolean;
  };
  viewportSize: ElementSize;
};

const WORKSPACE_LAYOUT_V2_EMPTY_ELEMENT_SIZE: ElementSize = {
  heightPx: 0,
  widthPx: 0,
};

const WORKSPACE_LAYOUT_V2_LOCAL_STORE_INITIAL_STATE: WorkspaceLayoutV2LocalStoreState =
  {
    activeResizeSide: null,
    mobile: {
      grip: WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP,
      isPaneSettled: true,
    },
    viewportSize: WORKSPACE_LAYOUT_V2_EMPTY_ELEMENT_SIZE,
  };

/**
 * Owns transient layout interaction state for one mounted workspace runtime.
 * The store is carried by WorkspacePaneRuntimeContext so the folder has one
 * provider and one React context.
 */
function useCreateWorkspaceLayoutV2Store() {
  return useCreateStore(
    WORKSPACE_LAYOUT_V2_LOCAL_STORE_INITIAL_STATE,
    ({ setState }) => ({
      setActiveResizeSide: (
        activeResizeSide: WorkspaceLayoutV2ActiveResizeSide,
      ) => {
        setState((state) =>
          state.activeResizeSide === activeResizeSide
            ? state
            : { ...state, activeResizeSide },
        );
      },
      setIsMobilePaneSettled: (isPaneSettled: boolean) => {
        setState((state) =>
          state.mobile.isPaneSettled === isPaneSettled
            ? state
            : {
                ...state,
                mobile: { ...state.mobile, isPaneSettled },
              },
        );
      },
      setMobileGrip: (grip: WorkspaceLayoutV2MobileGrip) => {
        setState((state) =>
          state.mobile.grip === grip
            ? state
            : {
                ...state,
                mobile: { ...state.mobile, grip },
              },
        );
      },
      setViewportSize: (viewportSize: ElementSize) => {
        setState((state) =>
          state.viewportSize.heightPx === viewportSize.heightPx &&
          state.viewportSize.widthPx === viewportSize.widthPx
            ? state
            : { ...state, viewportSize },
        );
      },
    }),
  );
}

type WorkspaceLayoutV2Store = ReturnType<
  typeof useCreateWorkspaceLayoutV2Store
>;

type WorkspacePaneRuntimeContextValue = {
  actions: WorkspacePaneActions;
  layoutStore: WorkspaceLayoutV2Store;
  state: WorkspacePaneState;
};

type WorkspacePaneRuntimeProviderProps = {
  children: ReactNode;
  controller: WorkspaceSidebarStateController;
  shortcutPaneSide?: WorkspacePaneSide;
};

const WorkspacePaneRuntimeContext =
  createContext<WorkspacePaneRuntimeContextValue | null>(null);

/** Returns durable workspace pane actions from the runtime boundary. */
export function useWorkspacePaneActions() {
  return useWorkspacePaneRuntime().actions;
}

/**
 * Returns durable workspace pane state. The persisted fields remain
 * sidebar-shaped for now, but app code should read them through this pane hook.
 */
export function useWorkspacePaneState() {
  return useWorkspacePaneRuntime().state;
}

/**
 * Returns actions from the transient layout store inside the workspace runtime.
 * This must run under WorkspacePaneRuntimeProvider so each shell owns its own
 * resize, viewport, and mobile interaction state.
 */
export function useWorkspaceLayoutV2Actions() {
  return useWorkspacePaneRuntime().layoutStore.actions;
}

/**
 * Reads a selected slice from the transient layout store carried by the single
 * workspace runtime context.
 */
export function useWorkspaceLayoutV2Selector<T>(
  selector: (state: WorkspaceLayoutV2LocalStoreState) => T,
) {
  const { layoutStore } = useWorkspacePaneRuntime();

  return useSelector(layoutStore, selector);
}

/**
 * Pane actions expose React dispatch setters so callers can update from the
 * current persisted value without learning the controller persistence contract.
 */
function resolveNextPaneValue<T>(
  currentValue: T,
  nextValue: SetStateAction<T>,
) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
}

function areMobileSurfacesEqual(
  left: WorkspaceSidebarState["mobileSurface"],
  right: WorkspaceSidebarState["mobileSurface"],
) {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "unmerged") {
    return true;
  }

  return (
    right.kind === "merged" &&
    left.side === right.side &&
    left.mainWidthPx === right.mainWidthPx
  );
}

/**
 * Owns the single workspace pane runtime boundary. Storage adapters choose
 * persistence before this point; workspace layout internals read pane state,
 * pane actions, and transient layout interaction state from this provider.
 */
export function WorkspacePaneRuntimeProvider({
  children,
  controller,
  shortcutPaneSide = "left",
}: WorkspacePaneRuntimeProviderProps) {
  const isMobile = useIsMobile();

  const workspaceLayoutStore = useCreateWorkspaceLayoutV2Store();

  const updatePaneState = useCallback(
    <Key extends keyof WorkspaceSidebarState>(
      key: Key,
      nextValue: SetStateAction<WorkspaceSidebarState[Key]>,
      persistenceMode: WorkspaceSidebarStatePersistenceMode,
    ) => {
      controller.setState((state) => {
        const nextFieldValue = resolveNextPaneValue(state[key], nextValue);
        if (state[key] === nextFieldValue) {
          return state;
        }

        const nextState = { ...state };
        nextState[key] = nextFieldValue;
        return nextState;
      }, persistenceMode);
    },
    [controller],
  );

  const setLeftDesktopOpen = useCallback(
    (nextOpen: SetStateAction<boolean>) => {
      updatePaneState("leftDesktopOpen", nextOpen, "immediate");
    },
    [updatePaneState],
  );

  const setRightDesktopOpen = useCallback(
    (nextOpen: SetStateAction<boolean>) => {
      updatePaneState("rightDesktopOpen", nextOpen, "immediate");
    },
    [updatePaneState],
  );

  const setLeftDesktopWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updatePaneState("leftDesktopWidthPx", nextWidthPx, "width_deferred");
    },
    [updatePaneState],
  );

  const setRightDesktopWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updatePaneState("rightDesktopWidthPx", nextWidthPx, "width_deferred");
    },
    [updatePaneState],
  );

  const setLeftMobileWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updatePaneState("leftMobileWidthPx", nextWidthPx, "width_deferred");
    },
    [updatePaneState],
  );

  const setRightMobileWidthPx = useCallback(
    (nextWidthPx: SetStateAction<number>) => {
      updatePaneState("rightMobileWidthPx", nextWidthPx, "width_deferred");
    },
    [updatePaneState],
  );

  const setMobilePane = useCallback(
    (nextPane: SetStateAction<WorkspaceMobilePane>) => {
      controller.setState((state) => {
        const nextMobilePane = resolveNextPaneValue(state.mobilePane, nextPane);
        if (
          state.mobilePane === nextMobilePane &&
          (nextMobilePane !== "main" || state.mobileSurface.kind === "unmerged")
        ) {
          return state;
        }

        return {
          ...state,
          mobilePane: nextMobilePane,
          mobileSurface:
            nextMobilePane === "main"
              ? WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE
              : state.mobileSurface,
        };
      }, "immediate");
    },
    [controller],
  );

  const setMobileSurface = useCallback(
    (nextSurface: SetStateAction<WorkspaceSidebarState["mobileSurface"]>) => {
      controller.setState((state) => {
        const nextMobileSurface = resolveNextPaneValue(
          state.mobileSurface,
          nextSurface,
        );
        if (areMobileSurfacesEqual(state.mobileSurface, nextMobileSurface)) {
          return state;
        }

        return { ...state, mobileSurface: nextMobileSurface };
      }, "immediate");
    },
    [controller],
  );

  const settleMobileMergedSurface = useCallback(
    ({
      mainWidthPx,
      side,
      sideWidthPx,
    }: {
      mainWidthPx: number;
      side: WorkspacePaneSide;
      sideWidthPx: number;
    }) => {
      controller.setState((state) => {
        const nextMobileSurface = {
          kind: "merged",
          mainWidthPx,
          side,
        } satisfies WorkspaceSidebarState["mobileSurface"];
        const nextState = {
          ...state,
          leftMobileWidthPx:
            side === "left" ? sideWidthPx : state.leftMobileWidthPx,
          mobilePane: side,
          mobileSurface: nextMobileSurface,
          rightMobileWidthPx:
            side === "right" ? sideWidthPx : state.rightMobileWidthPx,
        };

        if (
          state.mobilePane === nextState.mobilePane &&
          state.leftMobileWidthPx === nextState.leftMobileWidthPx &&
          state.rightMobileWidthPx === nextState.rightMobileWidthPx &&
          areMobileSurfacesEqual(state.mobileSurface, nextMobileSurface)
        ) {
          return state;
        }

        return nextState;
      }, "immediate");
    },
    [controller],
  );

  const {
    leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane,
    mobileSurface,
    rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
  } = controller.state;

  const toggleLeftPane = useCallback(() => {
    if (isMobile) {
      setMobilePane((currentPane) =>
        currentPane === "left" ? "main" : "left",
      );
      return;
    }

    setLeftDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setLeftDesktopOpen, setMobilePane]);

  const toggleRightPane = useCallback(() => {
    if (isMobile) {
      setMobilePane((currentPane) =>
        currentPane === "right" ? "main" : "right",
      );
      return;
    }

    setRightDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setMobilePane, setRightDesktopOpen]);

  const workspacePaneState = useMemo<WorkspacePaneState>(
    () => ({
      isMobile,
      leftDesktopOpen,
      leftDesktopWidthPx,
      leftMobileWidthPx,
      mobilePane,
      mobileSurface,
      rightDesktopOpen,
      rightDesktopWidthPx,
      rightMobileWidthPx,
    }),
    [
      isMobile,
      leftDesktopOpen,
      leftDesktopWidthPx,
      leftMobileWidthPx,
      mobilePane,
      mobileSurface,
      rightDesktopOpen,
      rightDesktopWidthPx,
      rightMobileWidthPx,
    ],
  );

  const workspacePaneActions = useMemo<WorkspacePaneActions>(
    () => ({
      setLeftDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      setMobilePane,
      setMobileSurface,
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      settleMobileMergedSurface,
      toggleLeftPane,
      toggleRightPane,
    }),
    [
      setLeftDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      setMobilePane,
      setMobileSurface,
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      settleMobileMergedSurface,
      toggleLeftPane,
      toggleRightPane,
    ],
  );

  const runtime = useMemo<WorkspacePaneRuntimeContextValue>(
    () => ({
      actions: workspacePaneActions,
      layoutStore: workspaceLayoutStore,
      state: workspacePaneState,
    }),
    [workspaceLayoutStore, workspacePaneActions, workspacePaneState],
  );

  /**
   * Registers the global pane shortcut at the workspace runtime boundary so
   * route content does not need to own pane keyboard listeners.
   */
  useEffect(() => {
    if (!controller.isHydrated) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === WORKSPACE_PANE_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        if (shortcutPaneSide === "right") {
          workspacePaneActions.toggleRightPane();
          return;
        }
        workspacePaneActions.toggleLeftPane();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller.isHydrated, shortcutPaneSide, workspacePaneActions]);

  if (!controller.isHydrated) {
    return null;
  }

  return (
    <WorkspacePaneRuntimeContext.Provider value={runtime}>
      {children}
    </WorkspacePaneRuntimeContext.Provider>
  );
}

function useWorkspacePaneRuntime() {
  const runtime = useContext(WorkspacePaneRuntimeContext);
  if (runtime === null) {
    throw new Error("Workspace pane runtime context is missing.");
  }

  return runtime;
}
