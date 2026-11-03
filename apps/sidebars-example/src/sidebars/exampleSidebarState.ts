import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStatePersistenceMode,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";
import { readExampleSidebarStoredState, writeExampleSidebarState } from "./exampleSidebarStorage";

const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;
const EXAMPLE_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies SidebarLayoutState;

function readExampleSidebarState(): SidebarLayoutState {
  return readExampleSidebarStoredState() ?? EXAMPLE_SIDEBAR_DEFAULT_STATE;
}

/**
The server and the hydration render the defaults, and the initial state script shows the stored
state before the first paint. This controller installs the stored state in a layout effect after
hydration; the layout's first measured commit then writes every root attribute from that state.
*/
export function useExampleSidebarController(): SidebarLayoutStateController {
  const [sidebarState, setSidebarState] = useState<SidebarLayoutState>(
    EXAMPLE_SIDEBAR_DEFAULT_STATE,
  );
  const latestSidebarStateRef = useRef<SidebarLayoutState>(sidebarState);
  const pendingWidthPersistStateRef = useRef<SidebarLayoutState | null>(null);
  const pendingWidthPersistTimeoutRef = useRef<number | null>(null);

  const clearPendingWidthPersist = useCallback(() => {
    if (pendingWidthPersistTimeoutRef.current !== null) {
      window.clearTimeout(pendingWidthPersistTimeoutRef.current);
    }

    pendingWidthPersistTimeoutRef.current = null;
    pendingWidthPersistStateRef.current = null;
  }, []);

  const flushPendingWidthPersist = useCallback(() => {
    const pendingState = pendingWidthPersistStateRef.current;
    clearPendingWidthPersist();
    if (pendingState !== null) {
      writeExampleSidebarState(pendingState);
    }
  }, [clearPendingWidthPersist]);

  const persistSidebarState = useCallback(
    (nextState: SidebarLayoutState) => {
      clearPendingWidthPersist();
      writeExampleSidebarState(nextState);
    },
    [clearPendingWidthPersist],
  );

  const scheduleWidthPersist = useCallback(
    (nextState: SidebarLayoutState) => {
      clearPendingWidthPersist();
      pendingWidthPersistStateRef.current = nextState;
      pendingWidthPersistTimeoutRef.current = window.setTimeout(() => {
        pendingWidthPersistTimeoutRef.current = null;
        pendingWidthPersistStateRef.current = null;
        writeExampleSidebarState(nextState);
      }, SIDEBAR_WIDTH_PERSIST_DELAY_MS);
    },
    [clearPendingWidthPersist],
  );

  const applySidebarState = useCallback(
    (updateState: SidebarLayoutStateUpdate, persistenceMode: SidebarLayoutStatePersistenceMode) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = updateState(currentState);
      if (nextState === currentState) {
        return;
      }

      latestSidebarStateRef.current = nextState;
      setSidebarState(nextState);
      if (persistenceMode === "immediate") {
        persistSidebarState(nextState);
        return;
      }

      scheduleWidthPersist(nextState);
    },
    [persistSidebarState, scheduleWidthPersist],
  );

  useLayoutEffect(() => {
    const storedState = readExampleSidebarState();
    latestSidebarStateRef.current = storedState;
    // eslint-disable-next-line react/set-state-in-effect -- Apply local storage after hydration to keep the server and first client render equal.
    setSidebarState(storedState);
  }, []);

  useEffect(() => flushPendingWidthPersist, [flushPendingWidthPersist]);

  return useMemo(
    () => ({
      setState: applySidebarState,
      state: sidebarState,
    }),
    [applySidebarState, sidebarState],
  );
}
