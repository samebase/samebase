import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import type { ElementSize } from "@/hooks/useElementSize";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import {
  WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP,
  WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE,
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2MobileGrip,
  type WorkspaceLayoutV2MobileSurface,
} from "./WorkspaceLayoutV2Geometry";

export type WorkspaceLayoutV2LocalStoreState = {
  activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
  mobile: {
    grip: WorkspaceLayoutV2MobileGrip;
    isPaneSettled: boolean;
    surface: WorkspaceLayoutV2MobileSurface;
  };
  viewportSize: ElementSize;
};

export type WorkspaceLayoutV2PaneState = WorkspaceSidebarState & {
  isMobile: boolean;
};

export type WorkspaceLayoutV2PaneActions = {
  setLeftDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setLeftMobileWidthPx: Dispatch<SetStateAction<number>>;
  setMobilePane: Dispatch<SetStateAction<WorkspaceSidebarState["mobilePane"]>>;
  setRightDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setRightMobileWidthPx: Dispatch<SetStateAction<number>>;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
};

export type WorkspaceLayoutV2PaneContextValue = {
  actions: WorkspaceLayoutV2PaneActions;
  state: WorkspaceLayoutV2PaneState;
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
      surface: WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE,
    },
    viewportSize: WORKSPACE_LAYOUT_V2_EMPTY_ELEMENT_SIZE,
  };

/**
 * Owns the private workspace layout state tree. Consumers receive the store
 * through context and read named slices with TanStack Store selectors.
 */
export function useCreateWorkspaceLayoutV2Store() {
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
      setMobileSurface: (surface: WorkspaceLayoutV2MobileSurface) => {
        setState((state) =>
          state.mobile.surface === surface
            ? state
            : {
                ...state,
                mobile: { ...state.mobile, surface },
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

export type WorkspaceLayoutV2Store = ReturnType<
  typeof useCreateWorkspaceLayoutV2Store
>;

export const WorkspaceLayoutV2Context =
  createContext<WorkspaceLayoutV2Store | null>(null);
export const WorkspaceLayoutV2PaneContext =
  createContext<WorkspaceLayoutV2PaneContextValue | null>(null);

/**
 * Returns actions from the layout-local WorkspaceLayoutV2Context store. This
 * must run under WorkspaceLayoutSidebarProvider; useWorkspaceLayoutV2Store
 * throws when the provider boundary is missing so layout state is not silently
 * shared.
 */
export function useWorkspaceLayoutV2Actions() {
  return useWorkspaceLayoutV2Store().actions;
}

/**
 * Reads a selected slice from the layout-local WorkspaceLayoutV2Context store.
 * This must run under WorkspaceLayoutSidebarProvider so each pane shell owns
 * its own resize, viewport, and mobile interaction state.
 */
export function useWorkspaceLayoutV2Selector<T>(
  selector: (state: WorkspaceLayoutV2LocalStoreState) => T,
) {
  return useSelector(useWorkspaceLayoutV2Store(), selector);
}

/**
 * Returns durable pane actions from the workspace layout provider. Layout
 * internals use this instead of the compatibility `useSidebar()` hook so their
 * dependency points at the pane model.
 */
export function useWorkspaceLayoutV2PaneActions() {
  return useWorkspaceLayoutV2PaneContext().actions;
}

/**
 * Returns durable pane state from the workspace layout provider. The persisted
 * field names stay sidebar-shaped for now, but this hook keeps v2 layout code
 * attached to the workspace pane boundary.
 */
export function useWorkspaceLayoutV2PaneState() {
  return useWorkspaceLayoutV2PaneContext().state;
}

function useWorkspaceLayoutV2Store() {
  const store = useContext(WorkspaceLayoutV2Context);
  if (store === null) {
    throw new Error("WorkspaceLayoutV2 context is missing.");
  }

  return store;
}

function useWorkspaceLayoutV2PaneContext() {
  const context = useContext(WorkspaceLayoutV2PaneContext);
  if (context === null) {
    throw new Error("WorkspaceLayoutV2 pane context is missing.");
  }

  return context;
}
