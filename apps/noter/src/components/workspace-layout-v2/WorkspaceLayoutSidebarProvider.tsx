import {
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  SidebarContext,
  type MobileSidebarPane,
  type SidebarContextProps,
  type SidebarSide,
} from "@/hooks/use-sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  WorkspaceSidebarStateController,
  WorkspaceSidebarStatePersistenceMode,
} from "@/lib/workspaceSidebarStateController";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import {
  useCreateWorkspaceLayoutV2Store,
  WorkspaceLayoutV2Context,
} from "./WorkspaceLayoutV2Context";

const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type WorkspaceLayoutSidebarProviderProps = {
  children: ReactNode;
  controller: WorkspaceSidebarStateController;
  shortcutSidebarSide?: SidebarSide;
};

/**
 * `useSidebar()` still exposes React dispatch setters while consumers migrate
 * to the pane model, so resolve updater functions once at the controller edge.
 */
function resolveNextUseSidebarValue<T>(
  currentValue: T,
  nextValue: SetStateAction<T>,
) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
}

/**
 * Owns the workspace layout provider boundary. Storage adapters choose how
 * durable state is persisted; this provider translates that state into the
 * stable `useSidebar()` API and hosts transient pane interaction state while
 * pane state convergence continues.
 */
export function WorkspaceLayoutSidebarProvider({
  children,
  controller,
  shortcutSidebarSide = "left",
}: WorkspaceLayoutSidebarProviderProps) {
  const isMobile = useIsMobile();
  const workspaceLayoutStore = useCreateWorkspaceLayoutV2Store();
  const updateSidebarState = useCallback(
    <Key extends keyof WorkspaceSidebarState>(
      key: Key,
      nextValue: SetStateAction<WorkspaceSidebarState[Key]>,
      persistenceMode: WorkspaceSidebarStatePersistenceMode,
    ) => {
      controller.setState((state) => {
        const nextFieldValue = resolveNextUseSidebarValue(
          state[key],
          nextValue,
        );
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
    (nextPane: SetStateAction<MobileSidebarPane>) => {
      updateSidebarState("mobilePane", nextPane, "immediate");
    },
    [updateSidebarState],
  );
  const setOpenMobile = useCallback(
    (nextOpen: boolean) => {
      setMobilePane(nextOpen ? shortcutSidebarSide : "main");
    },
    [setMobilePane, shortcutSidebarSide],
  );

  const {
    leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane,
    rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
  } = controller.state;
  const toggleLeftSidebar = useCallback(() => {
    if (isMobile) {
      setMobilePane((currentPane) =>
        currentPane === "left" ? "main" : "left",
      );
      return;
    }

    setLeftDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setLeftDesktopOpen, setMobilePane]);
  const toggleRightSidebar = useCallback(() => {
    if (isMobile) {
      setMobilePane((currentPane) =>
        currentPane === "right" ? "main" : "right",
      );
      return;
    }

    setRightDesktopOpen((currentOpen) => !currentOpen);
  }, [isMobile, setMobilePane, setRightDesktopOpen]);

  /**
   * Registers the global sidebar shortcut at the workspace layout boundary so
   * route content can keep using `useSidebar` without owning keyboard listeners.
   */
  useEffect(() => {
    if (!controller.isHydrated) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        if (shortcutSidebarSide === "right") {
          toggleRightSidebar();
          return;
        }
        toggleLeftSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    controller.isHydrated,
    shortcutSidebarSide,
    toggleLeftSidebar,
    toggleRightSidebar,
  ]);

  const primaryDesktopOpen =
    shortcutSidebarSide === "right" ? rightDesktopOpen : leftDesktopOpen;
  const setPrimaryDesktopOpen =
    shortcutSidebarSide === "right" ? setRightDesktopOpen : setLeftDesktopOpen;
  const togglePrimarySidebar =
    shortcutSidebarSide === "right" ? toggleRightSidebar : toggleLeftSidebar;
  const contextValue = useMemo<SidebarContextProps>(
    () => ({
      isMobile,
      leftDesktopOpen,
      leftDesktopWidthPx,
      leftMobileWidthPx,
      setLeftDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      rightDesktopOpen,
      rightDesktopWidthPx,
      rightMobileWidthPx,
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      mobilePane,
      setMobilePane,
      toggleLeftSidebar,
      toggleRightSidebar,
      state: primaryDesktopOpen ? "expanded" : "collapsed",
      open: primaryDesktopOpen,
      setOpen: setPrimaryDesktopOpen,
      openMobile: mobilePane === shortcutSidebarSide,
      setOpenMobile,
      toggleSidebar: togglePrimarySidebar,
    }),
    [
      isMobile,
      leftDesktopOpen,
      leftDesktopWidthPx,
      leftMobileWidthPx,
      setLeftDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      rightDesktopOpen,
      rightDesktopWidthPx,
      rightMobileWidthPx,
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      mobilePane,
      setMobilePane,
      toggleLeftSidebar,
      toggleRightSidebar,
      primaryDesktopOpen,
      setPrimaryDesktopOpen,
      shortcutSidebarSide,
      setOpenMobile,
      togglePrimarySidebar,
    ],
  );

  if (!controller.isHydrated) {
    return null;
  }

  return (
    <WorkspaceLayoutV2Context.Provider value={workspaceLayoutStore}>
      <SidebarContext.Provider value={contextValue}>
        {children}
      </SidebarContext.Provider>
    </WorkspaceLayoutV2Context.Provider>
  );
}
