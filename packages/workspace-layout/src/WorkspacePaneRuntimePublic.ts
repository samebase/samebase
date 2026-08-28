import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  WorkspacePaneRuntimeProvider,
  useWorkspaceLayoutV2Selector,
  useWorkspacePaneActions as useWorkspacePaneActionsInternal,
  useWorkspacePaneState,
} from "./WorkspacePaneRuntime.tsx";
import {
  getWorkspaceLayoutPresentation,
  type WorkspaceLayoutPresentation,
} from "./WorkspaceLayoutPresentation.ts";
import type { WorkspaceMobilePane } from "./WorkspaceLayoutV2State.ts";

export { WorkspacePaneRuntimeProvider };
export type { WorkspacePaneRuntimeProviderProps } from "./WorkspacePaneRuntime.tsx";
export type {
  WorkspaceLayoutPresentation,
  WorkspaceLayoutMobileMergeProgress,
} from "./WorkspaceLayoutPresentation.ts";
export type {
  WorkspaceMobilePane,
  WorkspacePaneSide,
  WorkspaceSidebarStateController,
} from "./WorkspaceLayoutV2State.ts";

export type WorkspacePaneActions = {
  openRightPane: () => void;
  setMobilePane: Dispatch<SetStateAction<WorkspaceMobilePane>>;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
};

export function useWorkspacePaneActions(): WorkspacePaneActions {
  const { openRightPane, setMobilePane, toggleLeftPane, toggleRightPane } =
    useWorkspacePaneActionsInternal();

  return useMemo(
    () => ({ openRightPane, setMobilePane, toggleLeftPane, toggleRightPane }),
    [openRightPane, setMobilePane, toggleLeftPane, toggleRightPane],
  );
}

export function useWorkspaceLayoutPresentation(): WorkspaceLayoutPresentation {
  const paneState = useWorkspacePaneState();
  const localState = useWorkspaceLayoutV2Selector((state) => state);

  return getWorkspaceLayoutPresentation({ localState, paneState });
}
