import { clearSidebarLayoutDesktopPrehydrationStyle } from "@samebase/sidebars/SidebarLayoutPrehydration";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";
import * as React from "react";
import { APP_WORKSPACE_SIDEBAR_PREHYDRATION_ARGS } from "@/lib/appWorkspaceSidebarPreferences";
import {
  readLocalWorkspaceSidebarState,
  writeLocalWorkspaceSidebarState,
} from "@/lib/localWorkspaceSidebarState";

/**
The sidebar state of a page that renders without a session, saved in local storage on every change.
The server and the hydration render `defaults`, and the inline prehydration script shows the stored
state before the first paint. This hook installs the stored state in the layout effect after
hydration, before the browser paints. The script's temporary stylesheet stays until a commit has
rendered the stored state: a style calculation between the two commits would otherwise see the
defaults, and a width transition would animate from them.
*/
export function useLocalWorkspaceSidebarState(
  defaults: SidebarLayoutState,
): SidebarLayoutStateController {
  const [state, setState] = React.useState(defaults);
  const stateRef = React.useRef(state);
  const [storedStateRendered, setStoredStateRendered] = React.useState(false);

  React.useLayoutEffect(() => {
    const storedState = readLocalWorkspaceSidebarState();
    if (storedState !== null) {
      stateRef.current = storedState;
      setState(storedState);
    }
    setStoredStateRendered(true);
  }, []);

  React.useLayoutEffect(() => {
    if (storedStateRendered) {
      clearSidebarLayoutDesktopPrehydrationStyle(APP_WORKSPACE_SIDEBAR_PREHYDRATION_ARGS);
    }
  }, [storedStateRendered]);

  const setSidebarState = React.useCallback((updateState: SidebarLayoutStateUpdate) => {
    const nextState = updateState(stateRef.current);
    if (nextState === stateRef.current) {
      return;
    }

    stateRef.current = nextState;
    setState(nextState);
    writeLocalWorkspaceSidebarState(nextState);
  }, []);

  return React.useMemo(
    () => ({ isHydrated: true, state, setState: setSidebarState }),
    [setSidebarState, state],
  );
}
