import { useCallback, useMemo, useState } from "react";
import type { WorkspaceSidebarStateController } from "@/lib/workspaceSidebarStateController";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";

/**
 * Provides deterministic in-memory sidebar state for fixtures and component
 * tests. It uses the same controller contract as Convex/localStorage adapters
 * so those surfaces still exercise the workspace-layout sidebar boundary.
 */
export function useWorkspaceLayoutV2MemorySidebarController(
  initialState: WorkspaceSidebarState,
): WorkspaceSidebarStateController {
  const [state, setState] = useState(initialState);
  const setControllerState = useCallback<
    WorkspaceSidebarStateController["setState"]
  >((updateState) => {
    setState((currentState) => updateState(currentState));
  }, []);

  return useMemo(
    () => ({
      isHydrated: true,
      setState: setControllerState,
      state,
    }),
    [setControllerState, state],
  );
}
