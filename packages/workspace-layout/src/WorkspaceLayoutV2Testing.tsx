import { useCallback, useMemo, useState, type ReactNode } from "react";
import { WorkspacePaneRuntimeProvider } from "./WorkspacePaneRuntime.tsx";
import type {
  WorkspaceSidebarState,
  WorkspaceSidebarStateController,
} from "./WorkspaceLayoutV2State.ts";

export function useWorkspaceLayoutV2MemorySidebarController(
  initialState: WorkspaceSidebarState,
): WorkspaceSidebarStateController {
  const [state, setState] = useState(initialState);
  const setControllerState = useCallback<WorkspaceSidebarStateController["setState"]>(
    (updateState) => {
      setState((currentState) => updateState(currentState));
    },
    [],
  );

  return useMemo(
    () => ({
      isHydrated: true,
      setState: setControllerState,
      state,
    }),
    [setControllerState, state],
  );
}

export function WorkspaceLayoutV2MemorySidebarProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState: WorkspaceSidebarState;
}) {
  const controller = useWorkspaceLayoutV2MemorySidebarController(initialState);

  return (
    <WorkspacePaneRuntimeProvider controller={controller}>{children}</WorkspacePaneRuntimeProvider>
  );
}
