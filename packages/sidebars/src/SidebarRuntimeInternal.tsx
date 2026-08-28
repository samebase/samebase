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
  SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_IDLE_MOBILE_GRIP,
  SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE,
  type SidebarLayoutActiveResizeSide,
  type SidebarLayoutMobileGrip,
} from "./SidebarLayoutGeometryInternal.ts";
import type {
  MobilePane,
  SidebarSide,
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStatePersistenceMode,
} from "./SidebarLayoutState.ts";

export type { MobilePane, SidebarSide } from "./SidebarLayoutState.ts";

export type SidebarRuntimeState = SidebarLayoutState & {
  isMobile: boolean;
};

export type SidebarRuntimeActions = {
  setLeftDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setLeftDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setLeftMobileWidthPx: Dispatch<SetStateAction<number>>;
  setMobilePane: Dispatch<SetStateAction<MobilePane>>;
  setMobileSurface: Dispatch<SetStateAction<SidebarLayoutState["mobileSurface"]>>;
  setRightDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setRightDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setRightMobileWidthPx: Dispatch<SetStateAction<number>>;
  settleMobileMergedSurface: (args: {
    mainWidthPx: number;
    side: SidebarSide;
    sideWidthPx: number;
  }) => void;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
};

export type SidebarLayoutLocalStoreState = {
  activeResizeSide: SidebarLayoutActiveResizeSide;
  mobile: {
    grip: SidebarLayoutMobileGrip;
    isPaneSettled: boolean;
    paneScrollProgress: number;
  };
  viewportSize: {
    heightPx: number;
    widthPx: number;
  };
};

const SIDEBAR_LAYOUT_LOCAL_STORE_INITIAL_STATE: SidebarLayoutLocalStoreState = {
  activeResizeSide: null,
  mobile: {
    grip: SIDEBAR_LAYOUT_IDLE_MOBILE_GRIP,
    isPaneSettled: true,
    paneScrollProgress: 0,
  },
  viewportSize: {
    heightPx: 0,
    widthPx: 0,
  },
};

function useIsMobileSidebarLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX - 1}px)`,
    );
    const syncLayoutMode = () => {
      setIsMobile(window.innerWidth < SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX);
    };
    mediaQuery.addEventListener("change", syncLayoutMode);
    syncLayoutMode();

    return () => mediaQuery.removeEventListener("change", syncLayoutMode);
  }, []);

  return isMobile;
}

function useCreateSidebarLayoutStore() {
  return useCreateStore(SIDEBAR_LAYOUT_LOCAL_STORE_INITIAL_STATE, ({ setState }) => ({
    setActiveResizeSide: (activeResizeSide: SidebarLayoutActiveResizeSide) => {
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
    setMobileGrip: (grip: SidebarLayoutMobileGrip) => {
      setState((state) =>
        state.mobile.grip === grip
          ? state
          : {
              ...state,
              mobile: { ...state.mobile, grip },
            },
      );
    },
    setViewportSize: (viewportSize: SidebarLayoutLocalStoreState["viewportSize"]) => {
      setState((state) =>
        state.viewportSize.heightPx === viewportSize.heightPx &&
        state.viewportSize.widthPx === viewportSize.widthPx
          ? state
          : { ...state, viewportSize },
      );
    },
  }));
}

type SidebarLayoutStore = ReturnType<typeof useCreateSidebarLayoutStore>;

type SidebarRuntimeContextValue = {
  actions: SidebarRuntimeActions;
  layoutStore: SidebarLayoutStore;
  state: SidebarRuntimeState;
};

export type SidebarRuntimeProviderProps = {
  children: ReactNode;
  controller: SidebarLayoutStateController;
};

const SidebarRuntimeContext = createContext<SidebarRuntimeContextValue | null>(null);

export function useSidebarRuntimeActions() {
  return useSidebarRuntime().actions;
}

export function useSidebarRuntimeState() {
  return useSidebarRuntime().state;
}

export function useSidebarLayoutActions() {
  return useSidebarRuntime().layoutStore.actions;
}

export function useSidebarLayoutSelector<T>(selector: (state: SidebarLayoutLocalStoreState) => T) {
  const { layoutStore } = useSidebarRuntime();

  return useSelector(layoutStore, selector);
}

function resolveNextPaneValue<T>(currentValue: T, nextValue: SetStateAction<T>) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
}

function areMobileSurfacesEqual(
  left: SidebarLayoutState["mobileSurface"],
  right: SidebarLayoutState["mobileSurface"],
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

export function SidebarRuntimeProvider({ children, controller }: SidebarRuntimeProviderProps) {
  const isMobile = useIsMobileSidebarLayout();
  const sidebarLayoutStore = useCreateSidebarLayoutStore();

  const updatePaneState = useCallback(
    <Key extends keyof SidebarLayoutState>(
      key: Key,
      nextValue: SetStateAction<SidebarLayoutState[Key]>,
      persistenceMode: SidebarLayoutStatePersistenceMode,
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
    (nextPane: SetStateAction<MobilePane>) => {
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
              ? SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE
              : state.mobileSurface,
        };
      }, "immediate");
    },
    [controller],
  );

  const setMobileSurface = useCallback(
    (nextSurface: SetStateAction<SidebarLayoutState["mobileSurface"]>) => {
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
      side: SidebarSide;
      sideWidthPx: number;
    }) => {
      controller.setState((state) => {
        const nextMobileSurface = {
          kind: "merged",
          mainWidthPx,
          side,
        } satisfies SidebarLayoutState["mobileSurface"];
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
  const sidebarRuntimeState = useMemo<SidebarRuntimeState>(
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
  const sidebarRuntimeActions = useMemo<SidebarRuntimeActions>(
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
  const runtime = useMemo<SidebarRuntimeContextValue>(
    () => ({
      actions: sidebarRuntimeActions,
      layoutStore: sidebarLayoutStore,
      state: sidebarRuntimeState,
    }),
    [sidebarLayoutStore, sidebarRuntimeActions, sidebarRuntimeState],
  );

  if (!controller.isHydrated) {
    return null;
  }

  return (
    <SidebarRuntimeContext.Provider value={runtime}>{children}</SidebarRuntimeContext.Provider>
  );
}

function useSidebarRuntime() {
  const runtime = useContext(SidebarRuntimeContext);
  if (runtime === null) {
    throw new Error("Sidebar runtime context is missing.");
  }

  return runtime;
}
