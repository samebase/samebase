import { useCallback, useMemo, useState, type ReactNode } from "react";
import { SidebarRuntimeProvider } from "./SidebarRuntimeInternal.tsx";
import type { SidebarLayoutState, SidebarLayoutStateController } from "./SidebarLayoutState.ts";

export function useSidebarLayoutMemoryController(
  initialState: SidebarLayoutState,
): SidebarLayoutStateController {
  const [state, setState] = useState(initialState);
  const setControllerState = useCallback<SidebarLayoutStateController["setState"]>(
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

export function SidebarLayoutMemoryProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState: SidebarLayoutState;
}) {
  const controller = useSidebarLayoutMemoryController(initialState);

  return <SidebarRuntimeProvider controller={controller}>{children}</SidebarRuntimeProvider>;
}
