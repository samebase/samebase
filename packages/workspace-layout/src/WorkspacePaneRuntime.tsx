import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP,
  WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE,
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2MobileGrip,
} from "./WorkspaceLayoutV2Geometry.ts";
import type {
  WorkspaceMobilePane,
  WorkspacePaneSide,
  WorkspaceSidebarState,
  WorkspaceSidebarStateController,
  WorkspaceSidebarStatePersistenceMode,
} from "./WorkspaceLayoutV2State.ts";

export type { WorkspaceMobilePane, WorkspacePaneSide } from "./WorkspaceLayoutV2State.ts";

export type WorkspacePaneState = WorkspaceSidebarState & {
  isMobile: boolean;
};

export type WorkspacePaneActions = {
  openRightPane: () => void;
  setLeftDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setLeftDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setLeftMobileWidthPx: Dispatch<SetStateAction<number>>;
  setMobilePane: Dispatch<SetStateAction<WorkspaceMobilePane>>;
  setMobileSurface: Dispatch<SetStateAction<WorkspaceSidebarState["mobileSurface"]>>;
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
    paneNavigationRequest: WorkspaceMobilePane | null;
    paneScrollProgress: number;
  };
  viewportSize: {
    heightPx: number;
    widthPx: number;
  };
};

const WORKSPACE_LAYOUT_V2_LOCAL_STORE_INITIAL_STATE: WorkspaceLayoutV2LocalStoreState = {
  activeResizeSide: null,
  mobile: {
    grip: WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP,
    isPaneSettled: true,
    paneNavigationRequest: null,
    paneScrollProgress: 0,
  },
  viewportSize: {
    heightPx: 0,
    widthPx: 0,
  },
};

function useIsMobileWorkspaceLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.innerWidth < WORKSPACE_LAYOUT_V2_DESKTOP_MIN_WIDTH_PX,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${WORKSPACE_LAYOUT_V2_DESKTOP_MIN_WIDTH_PX - 1}px)`,
    );
    const syncLayoutMode = () => {
      setIsMobile(window.innerWidth < WORKSPACE_LAYOUT_V2_DESKTOP_MIN_WIDTH_PX);
    };
    mediaQuery.addEventListener("change", syncLayoutMode);
    syncLayoutMode();

    return () => mediaQuery.removeEventListener("change", syncLayoutMode);
  }, []);

  return isMobile;
}

function useCreateWorkspaceLayoutV2Store() {
  return useCreateStore(WORKSPACE_LAYOUT_V2_LOCAL_STORE_INITIAL_STATE, ({ setState }) => ({
    setActiveResizeSide: (activeResizeSide: WorkspaceLayoutV2ActiveResizeSide) => {
      setState((state) =>
        state.activeResizeSide === activeResizeSide ? state : { ...state, activeResizeSide },
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
    setMobilePaneScrollProgress: (paneScrollProgress: number) => {
      setState((state) =>
        state.mobile.paneScrollProgress === paneScrollProgress
          ? state
          : {
              ...state,
              mobile: { ...state.mobile, paneScrollProgress },
            },
      );
    },
    setMobilePaneNavigationRequest: (paneNavigationRequest: WorkspaceMobilePane | null) => {
      setState((state) =>
        state.mobile.paneNavigationRequest === paneNavigationRequest
          ? state
          : {
              ...state,
              mobile: { ...state.mobile, paneNavigationRequest },
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
    setViewportSize: (viewportSize: WorkspaceLayoutV2LocalStoreState["viewportSize"]) => {
      setState((state) =>
        state.viewportSize.heightPx === viewportSize.heightPx &&
        state.viewportSize.widthPx === viewportSize.widthPx
          ? state
          : { ...state, viewportSize },
      );
    },
  }));
}

type WorkspaceLayoutV2Store = ReturnType<typeof useCreateWorkspaceLayoutV2Store>;

type WorkspacePaneRuntimeContextValue = {
  actions: WorkspacePaneActions;
  layoutStore: WorkspaceLayoutV2Store;
  state: WorkspacePaneState;
};

export type WorkspacePaneRuntimeProviderProps = {
  children: ReactNode;
  controller: WorkspaceSidebarStateController;
};

const WorkspacePaneRuntimeContext = createContext<WorkspacePaneRuntimeContextValue | null>(null);

export function useWorkspacePaneActions() {
  return useWorkspacePaneRuntime().actions;
}

export function useWorkspacePaneState() {
  return useWorkspacePaneRuntime().state;
}

export function useWorkspaceLayoutV2Actions() {
  return useWorkspacePaneRuntime().layoutStore.actions;
}

export function useWorkspaceLayoutV2Selector<T>(
  selector: (state: WorkspaceLayoutV2LocalStoreState) => T,
) {
  const { layoutStore } = useWorkspacePaneRuntime();

  return useSelector(layoutStore, selector);
}

function resolveNextPaneValue<T>(currentValue: T, nextValue: SetStateAction<T>) {
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
    right.kind === "merged" && left.side === right.side && left.mainWidthPx === right.mainWidthPx
  );
}

export function WorkspacePaneRuntimeProvider({
  children,
  controller,
}: WorkspacePaneRuntimeProviderProps) {
  const isMobile = useIsMobileWorkspaceLayout();
  const workspaceLayoutStore = useCreateWorkspaceLayoutV2Store();
  const { setMobilePaneNavigationRequest } = workspaceLayoutStore.actions;

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
        const nextMobileSurface = resolveNextPaneValue(state.mobileSurface, nextSurface);
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
          leftMobileWidthPx: side === "left" ? sideWidthPx : state.leftMobileWidthPx,
          mobilePane: side,
          mobileSurface: nextMobileSurface,
          rightMobileWidthPx: side === "right" ? sideWidthPx : state.rightMobileWidthPx,
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
      setMobilePane((currentPane) => (currentPane === "left" ? "main" : "left"));
      return;
    }

    setLeftDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setLeftDesktopOpen, setMobilePane]);
  const toggleRightPane = useCallback(() => {
    if (isMobile) {
      setMobilePane((currentPane) => (currentPane === "right" ? "main" : "right"));
      return;
    }

    setRightDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setMobilePane, setRightDesktopOpen]);
  const openRightPane = useCallback(() => {
    if (isMobile) {
      setMobilePaneNavigationRequest("right");
      return;
    }

    setRightDesktopOpen(true);
  }, [isMobile, setMobilePaneNavigationRequest, setRightDesktopOpen]);

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
      openRightPane,
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
      openRightPane,
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
