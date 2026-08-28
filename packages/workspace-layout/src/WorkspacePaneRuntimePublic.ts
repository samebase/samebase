import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  WorkspacePaneRuntimeProvider,
  useWorkspaceLayoutV2Selector,
  useWorkspacePaneActions as useWorkspacePaneActionsInternal,
  useWorkspacePaneState,
} from "./WorkspacePaneRuntime.tsx";
import {
  getWorkspaceLayoutPresentation,
  useWorkspaceLayoutDisplayedMobileState,
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
  setMobilePane: Dispatch<SetStateAction<WorkspaceMobilePane>>;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
};

export function useWorkspacePaneActions(): WorkspacePaneActions {
  const { setMobilePane, toggleLeftPane, toggleRightPane } = useWorkspacePaneActionsInternal();

  return useMemo(
    () => ({ setMobilePane, toggleLeftPane, toggleRightPane }),
    [setMobilePane, toggleLeftPane, toggleRightPane],
  );
}

export function useWorkspaceLayoutPresentation(): WorkspaceLayoutPresentation {
  const displayedMobileState = useWorkspaceLayoutDisplayedMobileState();
  const paneState = useWorkspacePaneState();
  const localState = useWorkspaceLayoutV2Selector((state) => state);

  return getWorkspaceLayoutPresentation({ displayedMobileState, localState, paneState });
}
