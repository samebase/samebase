import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";
import * as React from "react";
import { VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE_KEY } from "@/lib/appWorkspaceSidebarPreferences";
import { parseWorkspaceSidebarState } from "@/lib/localWorkspaceSidebarState";

let seededState: { serialized: string | null; state: SidebarLayoutState | null } = {
  serialized: null,
  state: null,
};

/** The seeded state, the same object until the stored text changes. */
function readSeededState(): SidebarLayoutState | null {
  try {
    const serialized = window.localStorage.getItem(VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE_KEY);
    if (serialized !== seededState.serialized) {
      seededState = {
        serialized,
        state: serialized === null ? null : parseWorkspaceSidebarState(JSON.parse(serialized)),
      };
    }
    return seededState.state;
  } catch {
    return null;
  }
}

function subscribeToSeededState() {
  return () => {};
}

function readServerSeededState() {
  return null;
}

/**
The sidebar state of the `/visual-fixture` route: in memory only, so a fixture never reads or
writes the signed-in user's saved state. It starts from the seeded state of a visual test, which the
server cannot read, so the hydration renders `defaults` and React renders the seed right after.
*/
export function useVisualFixtureWorkspaceSidebarState(
  defaults: SidebarLayoutState,
): SidebarLayoutStateController {
  const seeded = React.useSyncExternalStore(
    subscribeToSeededState,
    readSeededState,
    readServerSeededState,
  );
  const [changedState, setChangedState] = React.useState<SidebarLayoutState | null>(null);
  const setState = React.useCallback(
    (updateState: SidebarLayoutStateUpdate) => {
      setChangedState((currentState) => updateState(currentState ?? readSeededState() ?? defaults));
    },
    [defaults],
  );

  return React.useMemo(
    () => ({ isHydrated: true, state: changedState ?? seeded ?? defaults, setState }),
    [changedState, defaults, seeded, setState],
  );
}
