import { guard, isRecord } from "@samebase/dependent";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStatePersistenceMode,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";
import * as React from "react";
import { APP_WORKSPACE_SIDEBAR_STORAGE_VERSION } from "@/lib/appWorkspaceSidebarPreferences";
import { notifyBrowserLocalStorageChanged } from "@/lib/localStorageSnapshot";

const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;

type UseLocalStorageWorkspaceSidebarStateArgs = {
  defaults: SidebarLayoutState;
  reset: boolean;
  storageKey: string;
};

type LocalStorageWorkspaceSidebarStateReadArgs = {
  defaults: SidebarLayoutState;
  reset: boolean;
  storageKey: string;
};

function serializeWorkspaceMobileSurface(surface: SidebarLayoutState["mobileSurface"]) {
  if (surface.kind === "unmerged") {
    return "unmerged";
  }

  return `merged:${surface.side}:${surface.mainWidthPx}`;
}

function serializeWorkspaceSidebarState(state: SidebarLayoutState): string {
  return [
    state.leftDesktopOpen ? "1" : "0",
    `${state.leftDesktopWidthPx}`,
    `${state.leftMobileWidthPx}`,
    state.mobilePane,
    serializeWorkspaceMobileSurface(state.mobileSurface),
    state.rightDesktopOpen ? "1" : "0",
    `${state.rightDesktopWidthPx}`,
    `${state.rightMobileWidthPx}`,
  ].join("|");
}

function areWorkspaceSidebarStatesEqual(left: SidebarLayoutState, right: SidebarLayoutState) {
  return serializeWorkspaceSidebarState(left) === serializeWorkspaceSidebarState(right);
}

function parseMobilePane(value: unknown): SidebarLayoutState["mobilePane"] | null {
  if (value === "left" || value === "main" || value === "right") {
    return value;
  }

  return null;
}

const isFiniteNumber = guard<unknown, number>((value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null,
);

function parseMobileSurface(value: unknown): SidebarLayoutState["mobileSurface"] | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value["kind"] === "unmerged") {
    return { kind: "unmerged" };
  }

  if (
    value["kind"] === "merged" &&
    (value["side"] === "left" || value["side"] === "right") &&
    isFiniteNumber(value["mainWidthPx"]) &&
    value["mainWidthPx"] > 0
  ) {
    return {
      kind: "merged",
      mainWidthPx: value["mainWidthPx"],
      side: value["side"],
    };
  }

  return null;
}

function parseWorkspaceSidebarState(value: unknown): SidebarLayoutState | null {
  if (!isRecord(value)) {
    return null;
  }

  const mobilePane = parseMobilePane(value["mobilePane"]);
  const mobileSurface = parseMobileSurface(value["mobileSurface"]);
  if (
    typeof value["leftDesktopOpen"] !== "boolean" ||
    !isFiniteNumber(value["leftDesktopWidthPx"]) ||
    !isFiniteNumber(value["leftMobileWidthPx"]) ||
    mobilePane === null ||
    mobileSurface === null ||
    typeof value["rightDesktopOpen"] !== "boolean" ||
    !isFiniteNumber(value["rightDesktopWidthPx"]) ||
    !isFiniteNumber(value["rightMobileWidthPx"])
  ) {
    return null;
  }

  return {
    leftDesktopOpen: value["leftDesktopOpen"],
    leftDesktopWidthPx: value["leftDesktopWidthPx"],
    leftMobileWidthPx: value["leftMobileWidthPx"],
    mobilePane,
    mobileSurface,
    rightDesktopOpen: value["rightDesktopOpen"],
    rightDesktopWidthPx: value["rightDesktopWidthPx"],
    rightMobileWidthPx: value["rightMobileWidthPx"],
  };
}

function parseStoredWorkspaceSidebarState(value: unknown): SidebarLayoutState | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value["version"] !== APP_WORKSPACE_SIDEBAR_STORAGE_VERSION) {
    return null;
  }

  return parseWorkspaceSidebarState(value["state"]);
}

function readLocalStorageWorkspaceSidebarState({
  defaults,
  reset,
  storageKey,
}: LocalStorageWorkspaceSidebarStateReadArgs): SidebarLayoutState {
  if (typeof window === "undefined") {
    return defaults;
  }

  if (reset) {
    return defaults;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue === null) {
      return defaults;
    }

    const storedState = parseStoredWorkspaceSidebarState(JSON.parse(storedValue));
    if (storedState === null) {
      return defaults;
    }

    return storedState;
  } catch (error: unknown) {
    console.warn("Failed to read local workspace sidebar state:", error);
    return defaults;
  }
}

function writeLocalStorageWorkspaceSidebarState({
  state,
  storageKey,
}: {
  state: SidebarLayoutState;
  storageKey: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        state,
        version: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
      }),
    );
    notifyBrowserLocalStorageChanged();
  } catch (error: unknown) {
    console.warn("Failed to write local workspace sidebar state:", error);
  }
}

function removeLocalStorageWorkspaceSidebarState(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
    notifyBrowserLocalStorageChanged();
  } catch (error: unknown) {
    console.warn("Failed to reset local workspace sidebar state:", error);
  }
}

/**
 * Keep anonymous app workspace preferences local until a signed-in shell can
 * use the Convex-backed sidebar preference store.
 */
export function useLocalStorageWorkspaceSidebarState({
  defaults,
  reset,
  storageKey,
}: UseLocalStorageWorkspaceSidebarStateArgs): SidebarLayoutStateController {
  const [sidebarState, setSidebarState] = React.useState(defaults);
  const latestSidebarStateRef = React.useRef(sidebarState);
  const pendingWidthPersistTimeoutRef = React.useRef<number | null>(null);
  const pendingWidthPersistStateRef = React.useRef<SidebarLayoutState | null>(null);

  const clearPendingWidthPersist = React.useCallback(() => {
    if (pendingWidthPersistTimeoutRef.current !== null) {
      window.clearTimeout(pendingWidthPersistTimeoutRef.current);
    }

    pendingWidthPersistTimeoutRef.current = null;
    pendingWidthPersistStateRef.current = null;
  }, []);

  const flushPendingWidthPersist = React.useCallback(() => {
    const pendingState = pendingWidthPersistStateRef.current;
    clearPendingWidthPersist();
    if (pendingState === null) {
      return;
    }

    writeLocalStorageWorkspaceSidebarState({
      state: pendingState,
      storageKey,
    });
  }, [clearPendingWidthPersist, storageKey]);

  const persistSidebarState = React.useCallback(
    (nextState: SidebarLayoutState) => {
      clearPendingWidthPersist();
      writeLocalStorageWorkspaceSidebarState({
        state: nextState,
        storageKey,
      });
    },
    [clearPendingWidthPersist, storageKey],
  );

  const scheduleWidthPersist = React.useCallback(
    (nextState: SidebarLayoutState) => {
      clearPendingWidthPersist();
      pendingWidthPersistStateRef.current = nextState;
      pendingWidthPersistTimeoutRef.current = window.setTimeout(() => {
        pendingWidthPersistTimeoutRef.current = null;
        pendingWidthPersistStateRef.current = null;
        writeLocalStorageWorkspaceSidebarState({
          state: nextState,
          storageKey,
        });
      }, SIDEBAR_WIDTH_PERSIST_DELAY_MS);
    },
    [clearPendingWidthPersist, storageKey],
  );

  const applySidebarState = React.useCallback(
    (updateState: SidebarLayoutStateUpdate, persistenceMode: SidebarLayoutStatePersistenceMode) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = updateState(currentState);

      if (areWorkspaceSidebarStatesEqual(currentState, nextState)) {
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

  React.useLayoutEffect(() => {
    if (reset) {
      clearPendingWidthPersist();
      removeLocalStorageWorkspaceSidebarState(storageKey);
    } else {
      flushPendingWidthPersist();
    }

    const nextSidebarState = readLocalStorageWorkspaceSidebarState({
      defaults,
      reset,
      storageKey,
    });
    latestSidebarStateRef.current = nextSidebarState;
    setSidebarState(nextSidebarState);
  }, [clearPendingWidthPersist, defaults, flushPendingWidthPersist, reset, storageKey]);

  React.useEffect(() => {
    return () => {
      flushPendingWidthPersist();
    };
  }, [flushPendingWidthPersist]);

  return React.useMemo(
    () => ({
      isHydrated: true,
      state: sidebarState,
      setState: applySidebarState,
    }),
    [applySidebarState, sidebarState],
  );
}
