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
  setRightDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setRightDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setRightMobileWidthPx: Dispatch<SetStateAction<number>>;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
};

type WorkspacePaneRuntimeContextValue = {
  actions: WorkspacePaneActions;
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
 * Pane actions expose React dispatch setters so callers can update from the
 * current persisted value without learning the controller persistence contract.
 */
function resolveNextPaneValue<T>(
  currentValue: T,
  nextValue: SetStateAction<T>,
) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
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
      updatePaneState("mobilePane", nextPane, "immediate");
    },
    [updatePaneState],
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
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      toggleLeftPane,
      toggleRightPane,
    }),
    [
      setLeftDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      setMobilePane,
      setRightDesktopOpen,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      toggleLeftPane,
      toggleRightPane,
    ],
  );

  const runtime = useMemo<WorkspacePaneRuntimeContextValue>(
    () => ({
      actions: workspacePaneActions,
      state: workspacePaneState,
    }),
    [workspacePaneActions, workspacePaneState],
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
    <WorkspaceLayoutV2Context.Provider value={workspaceLayoutStore}>
      <WorkspacePaneRuntimeContext.Provider value={runtime}>
        {children}
      </WorkspacePaneRuntimeContext.Provider>
    </WorkspaceLayoutV2Context.Provider>
  );
}

function useWorkspacePaneRuntime() {
  const runtime = useContext(WorkspacePaneRuntimeContext);
  if (runtime === null) {
    throw new Error("Workspace pane runtime context is missing.");
  }

  return runtime;
}
