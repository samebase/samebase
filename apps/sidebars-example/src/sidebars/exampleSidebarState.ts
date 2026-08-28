import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX } from "@samebase/sidebars/SidebarLayoutGeometry";
import {
  buildSidebarLayoutDesktopPrehydrationScript,
  buildSidebarLayoutMobilePanePrehydrationScript,
  clearSidebarLayoutDesktopPrehydrationStyle,
  type SidebarLayoutPrehydrationArgs,
  type SidebarLayoutPrehydrationState,
} from "@samebase/sidebars/SidebarLayoutPrehydration";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStatePersistenceMode,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";

const EXAMPLE_SIDEBAR_STORAGE_KEY = "samebase_sidebars_example_state";
const EXAMPLE_SIDEBAR_STORAGE_VERSION = 1;
const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;
const EXAMPLE_SIDEBAR_PREHYDRATION_ARGS = {
  desktopStyleElementId: "samebase-sidebars-example-prehydration",
} satisfies SidebarLayoutPrehydrationArgs;
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

/**
The package serializes this function into both prehydration scripts. Keep its
storage identity and validation self-contained so the serialized function does
not depend on module scope.
*/
function readExampleSidebarPrehydrationState(): SidebarLayoutPrehydrationState | null {
  function readFiniteNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function readMobilePane(value: unknown) {
    return value === "left" || value === "main" || value === "right" ? value : null;
  }

  function readMobileSurface(
    value: unknown,
  ): SidebarLayoutPrehydrationState["mobileSurface"] | null {
    if (value === null || typeof value !== "object" || !("kind" in value)) {
      return null;
    }

    if (value.kind === "unmerged") {
      return { kind: "unmerged" };
    }

    if (
      value.kind !== "merged" ||
      !("mainWidthPx" in value) ||
      !("side" in value) ||
      (value.side !== "left" && value.side !== "right")
    ) {
      return null;
    }

    const mainWidthPx = readFiniteNumber(value.mainWidthPx);
    return mainWidthPx === null ? null : { kind: "merged", mainWidthPx, side: value.side };
  }

  function readState(value: unknown): SidebarLayoutPrehydrationState | null {
    if (
      value === null ||
      typeof value !== "object" ||
      !("leftDesktopOpen" in value) ||
      !("leftDesktopWidthPx" in value) ||
      !("leftMobileWidthPx" in value) ||
      !("mobilePane" in value) ||
      !("mobileSurface" in value) ||
      !("rightDesktopOpen" in value) ||
      !("rightDesktopWidthPx" in value) ||
      !("rightMobileWidthPx" in value)
    ) {
      return null;
    }

    const leftDesktopWidthPx = readFiniteNumber(value.leftDesktopWidthPx);
    const leftMobileWidthPx = readFiniteNumber(value.leftMobileWidthPx);
    const mobilePane = readMobilePane(value.mobilePane);
    const mobileSurface = readMobileSurface(value.mobileSurface);
    const rightDesktopWidthPx = readFiniteNumber(value.rightDesktopWidthPx);
    const rightMobileWidthPx = readFiniteNumber(value.rightMobileWidthPx);
    if (
      typeof value.leftDesktopOpen !== "boolean" ||
      leftDesktopWidthPx === null ||
      leftMobileWidthPx === null ||
      mobilePane === null ||
      mobileSurface === null ||
      typeof value.rightDesktopOpen !== "boolean" ||
      rightDesktopWidthPx === null ||
      rightMobileWidthPx === null
    ) {
      return null;
    }

    return {
      leftDesktopOpen: value.leftDesktopOpen,
      leftDesktopWidthPx,
      leftMobileWidthPx,
      mobilePane,
      mobileSurface,
      rightDesktopOpen: value.rightDesktopOpen,
      rightDesktopWidthPx,
      rightMobileWidthPx,
    };
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const serializedState = window.localStorage.getItem("samebase_sidebars_example_state");
    if (serializedState === null) {
      return null;
    }

    const storedValue: unknown = JSON.parse(serializedState);
    if (
      storedValue === null ||
      typeof storedValue !== "object" ||
      !("version" in storedValue) ||
      storedValue.version !== 1 ||
      !("state" in storedValue)
    ) {
      return null;
    }

    return readState(storedValue.state);
  } catch {
    return null;
  }
}

function readExampleSidebarState(): SidebarLayoutState {
  const storedState = readExampleSidebarPrehydrationState();
  if (
    storedState === null ||
    (storedState.mobileSurface.kind === "merged" &&
      storedState.mobileSurface.mainWidthPx < SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX)
  ) {
    return EXAMPLE_SIDEBAR_DEFAULT_STATE;
  }

  return storedState;
}

function writeExampleSidebarState(state: SidebarLayoutState) {
  try {
    window.localStorage.setItem(
      EXAMPLE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state,
        version: EXAMPLE_SIDEBAR_STORAGE_VERSION,
      }),
    );
  } catch {}
}

export const exampleSidebarDesktopPrehydrationScript = buildSidebarLayoutDesktopPrehydrationScript(
  EXAMPLE_SIDEBAR_PREHYDRATION_ARGS,
  readExampleSidebarPrehydrationState,
);

export const exampleSidebarMobilePrehydrationScript =
  buildSidebarLayoutMobilePanePrehydrationScript(
    EXAMPLE_SIDEBAR_PREHYDRATION_ARGS,
    readExampleSidebarPrehydrationState,
  );

export function useExampleSidebarController(): SidebarLayoutStateController {
  const [sidebarState, setSidebarState] = useState<SidebarLayoutState>(
    EXAMPLE_SIDEBAR_DEFAULT_STATE,
  );
  const latestSidebarStateRef = useRef<SidebarLayoutState>(sidebarState);
  const pendingWidthPersistStateRef = useRef<SidebarLayoutState | null>(null);
  const pendingWidthPersistTimeoutRef = useRef<number | null>(null);
  const hasAppliedStoredStateRef = useRef(false);

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
    hasAppliedStoredStateRef.current = true;
    // eslint-disable-next-line react/set-state-in-effect -- Apply local storage after hydration to keep the server and first client render equal.
    setSidebarState(storedState);
  }, []);

  useLayoutEffect(() => {
    if (!hasAppliedStoredStateRef.current || sidebarState !== latestSidebarStateRef.current) {
      return;
    }

    clearSidebarLayoutDesktopPrehydrationStyle(EXAMPLE_SIDEBAR_PREHYDRATION_ARGS);
  }, [sidebarState]);

  useEffect(() => flushPendingWidthPersist, [flushPendingWidthPersist]);

  return useMemo(
    () => ({
      isHydrated: true,
      setState: applySidebarState,
      state: sidebarState,
    }),
    [applySidebarState, sidebarState],
  );
}
