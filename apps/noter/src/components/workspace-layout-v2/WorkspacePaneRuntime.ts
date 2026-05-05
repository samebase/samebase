import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";

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

export const WorkspacePaneActionsContext =
  createContext<WorkspacePaneActions | null>(null);
export const WorkspacePaneStateContext =
  createContext<WorkspacePaneState | null>(null);

/**
 * Returns durable workspace pane actions without subscribing to pane state
 * changes. Use this for buttons and handlers that only need to update panes.
 */
export function useWorkspacePaneActions() {
  const actions = useContext(WorkspacePaneActionsContext);
  if (actions === null) {
    throw new Error("Workspace pane actions context is missing.");
  }

  return actions;
}

/**
 * Returns durable workspace pane state. The persisted fields remain
 * sidebar-shaped for now, but app code should read them through this pane hook.
 */
export function useWorkspacePaneState() {
  const state = useContext(WorkspacePaneStateContext);
  if (state === null) {
    throw new Error("Workspace pane state context is missing.");
  }

  return state;
}
