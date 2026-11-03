import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";
import * as React from "react";
import {
  readLocalWorkspaceSidebarState,
  writeLocalWorkspaceSidebarState,
} from "@/lib/localWorkspaceSidebarState";

/**
The sidebar state of a page that renders without a session, saved in local storage on every change.
The server and the hydration render `defaults`, and the initial state script of the layout
(`lib/appWorkspaceSidebarInitialStateScript.ts`) shows the stored state before the first paint.
This hook installs the stored state in a layout effect after hydration, before the browser paints,
and that render writes the same root values that the script wrote.
*/
export function useLocalWorkspaceSidebarState(
  defaults: SidebarLayoutState,
): SidebarLayoutStateController {
  const [state, setState] = React.useState(defaults);
  const stateRef = React.useRef(state);

  React.useLayoutEffect(() => {
    const storedState = readLocalWorkspaceSidebarState();
    if (storedState !== null) {
      stateRef.current = storedState;
      setState(storedState);
    }
  }, []);

  const setSidebarState = React.useCallback((updateState: SidebarLayoutStateUpdate) => {
    const nextState = updateState(stateRef.current);
    if (nextState === stateRef.current) {
      return;
    }

    stateRef.current = nextState;
    setState(nextState);
    writeLocalWorkspaceSidebarState(nextState);
  }, []);

  return React.useMemo(() => ({ state, setState: setSidebarState }), [setSidebarState, state]);
}
