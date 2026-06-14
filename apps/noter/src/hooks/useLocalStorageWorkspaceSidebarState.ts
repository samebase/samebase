import * as React from "react";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import { WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX } from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import {
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
  appWorkspaceSidebarStoredStateSchema,
} from "@/lib/appWorkspaceSidebarPreferences";
import { notifyBrowserLocalStorageChanged } from "@/lib/localStorageSnapshot";
import type {
  WorkspaceSidebarStateController,
  WorkspaceSidebarStatePersistenceMode,
  WorkspaceSidebarStateUpdate,
} from "@/lib/workspaceSidebarStateController";

const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;

type UseLocalStorageWorkspaceSidebarStateArgs = {
  defaults: WorkspaceSidebarState;
  reset: boolean;
  storageKey: string;
};

type LocalStorageWorkspaceSidebarStateReadArgs = {
  defaults: WorkspaceSidebarState;
  reset: boolean;
  storageKey: string;
};

function serializeWorkspaceMobileSurface(surface: WorkspaceSidebarState["mobileSurface"]) {
  if (surface.kind === "unmerged") {
    return "unmerged";
  }

  return `merged:${surface.side}:${surface.mainWidthPx}`;
}

function serializeWorkspaceSidebarState(state: WorkspaceSidebarState): string {
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

function areWorkspaceSidebarStatesEqual(left: WorkspaceSidebarState, right: WorkspaceSidebarState) {
  return serializeWorkspaceSidebarState(left) === serializeWorkspaceSidebarState(right);
}

function readLocalStorageWorkspaceSidebarState({
  defaults,
  reset,
  storageKey,
}: LocalStorageWorkspaceSidebarStateReadArgs): WorkspaceSidebarState {
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

    const storedState = appWorkspaceSidebarStoredStateSchema({
      mobileMainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
      storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
      value: JSON.parse(storedValue),
    });
    if (!storedState[0]) {
      return defaults;
    }

    return storedState[1];
  } catch (error: unknown) {
    console.warn("Failed to read local workspace sidebar state:", error);
    return defaults;
  }
}

function writeLocalStorageWorkspaceSidebarState({
  state,
  storageKey,
}: {
  state: WorkspaceSidebarState;
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
}: UseLocalStorageWorkspaceSidebarStateArgs): WorkspaceSidebarStateController {
  const [sidebarState, setSidebarState] = React.useState(defaults);
  const latestSidebarStateRef = React.useRef(sidebarState);
  const pendingWidthPersistTimeoutRef = React.useRef<number | null>(null);
  const pendingWidthPersistStateRef = React.useRef<WorkspaceSidebarState | null>(null);

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
    (nextState: WorkspaceSidebarState) => {
      clearPendingWidthPersist();
      writeLocalStorageWorkspaceSidebarState({
        state: nextState,
        storageKey,
      });
    },
    [clearPendingWidthPersist, storageKey],
  );

  const scheduleWidthPersist = React.useCallback(
    (nextState: WorkspaceSidebarState) => {
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
    (
      updateState: WorkspaceSidebarStateUpdate,
      persistenceMode: WorkspaceSidebarStatePersistenceMode,
    ) => {
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
