import * as React from "react";
import type { PublicLayoutSidebarPreferenceSource } from "@/lib/publicLayoutSidebarPreferences";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;
const STORED_WORKSPACE_SIDEBAR_STATE_VERSION = 1;

type UseLocalStorageWorkspaceSidebarStateArgs = {
  defaults: WorkspaceSidebarState;
  reset: boolean;
  storageKey: string;
};

type UseLocalStorageWorkspaceSidebarStateResult = WorkspaceSidebarState & {
  preferenceSource: PublicLayoutSidebarPreferenceSource;
  setLeftDesktopOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLeftDesktopWidthPx: React.Dispatch<React.SetStateAction<number>>;
  setLeftMobileWidthPx: React.Dispatch<React.SetStateAction<number>>;
  setMobilePane: React.Dispatch<
    React.SetStateAction<WorkspaceSidebarState["mobilePane"]>
  >;
  setRightDesktopOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightDesktopWidthPx: React.Dispatch<React.SetStateAction<number>>;
  setRightMobileWidthPx: React.Dispatch<React.SetStateAction<number>>;
};

function resolveNextState<T>(
  currentValue: T,
  nextValue: React.SetStateAction<T>,
) {
  return nextValue instanceof Function ? nextValue(currentValue) : nextValue;
}

function serializeWorkspaceSidebarState(state: WorkspaceSidebarState): string {
  return [
    state.leftDesktopOpen ? "1" : "0",
    `${state.leftDesktopWidthPx}`,
    `${state.leftMobileWidthPx}`,
    state.mobilePane,
    state.rightDesktopOpen ? "1" : "0",
    `${state.rightDesktopWidthPx}`,
    `${state.rightMobileWidthPx}`,
  ].join("|");
}

function areWorkspaceSidebarStatesEqual(
  left: WorkspaceSidebarState,
  right: WorkspaceSidebarState,
) {
  return (
    serializeWorkspaceSidebarState(left) ===
    serializeWorkspaceSidebarState(right)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMobilePane(
  value: unknown,
): WorkspaceSidebarState["mobilePane"] | null {
  if (value === "left" || value === "main" || value === "right") {
    return value;
  }

  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseWorkspaceSidebarState(
  value: unknown,
): WorkspaceSidebarState | null {
  if (!isRecord(value)) {
    return null;
  }

  const mobilePane = parseMobilePane(value.mobilePane);
  if (
    typeof value.leftDesktopOpen !== "boolean" ||
    !isFiniteNumber(value.leftDesktopWidthPx) ||
    !isFiniteNumber(value.leftMobileWidthPx) ||
    mobilePane === null ||
    typeof value.rightDesktopOpen !== "boolean" ||
    !isFiniteNumber(value.rightDesktopWidthPx) ||
    !isFiniteNumber(value.rightMobileWidthPx)
  ) {
    return null;
  }

  return {
    leftDesktopOpen: value.leftDesktopOpen,
    leftDesktopWidthPx: value.leftDesktopWidthPx,
    leftMobileWidthPx: value.leftMobileWidthPx,
    mobilePane,
    rightDesktopOpen: value.rightDesktopOpen,
    rightDesktopWidthPx: value.rightDesktopWidthPx,
    rightMobileWidthPx: value.rightMobileWidthPx,
  };
}

function parseStoredWorkspaceSidebarState(
  value: unknown,
): WorkspaceSidebarState | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.version !== STORED_WORKSPACE_SIDEBAR_STATE_VERSION) {
    return null;
  }

  return parseWorkspaceSidebarState(value.state);
}

function readLocalStorageWorkspaceSidebarState({
  defaults,
  reset,
  storageKey,
}: UseLocalStorageWorkspaceSidebarStateArgs): {
  source: PublicLayoutSidebarPreferenceSource;
  state: WorkspaceSidebarState;
} {
  if (typeof window === "undefined") {
    return { source: reset ? "reset" : "default", state: defaults };
  }

  if (reset) {
    removeLocalStorageWorkspaceSidebarState(storageKey);
    return { source: "reset", state: defaults };
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue === null) {
      return { source: "default", state: defaults };
    }

    const storedState = parseStoredWorkspaceSidebarState(
      JSON.parse(storedValue),
    );
    if (storedState === null) {
      return { source: "default", state: defaults };
    }

    return { source: "local", state: storedState };
  } catch (error: unknown) {
    console.warn("Failed to read local workspace sidebar state:", error);
    return { source: "default", state: defaults };
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
        version: STORED_WORKSPACE_SIDEBAR_STATE_VERSION,
      }),
    );
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
  } catch (error: unknown) {
    console.warn("Failed to reset local workspace sidebar state:", error);
  }
}

/**
 * Keep anonymous public shell preferences local until a signed-in workspace can
 * use the Convex-backed sidebar preference store.
 */
export function useLocalStorageWorkspaceSidebarState({
  defaults,
  reset,
  storageKey,
}: UseLocalStorageWorkspaceSidebarStateArgs): UseLocalStorageWorkspaceSidebarStateResult {
  const [initialSidebarState] = React.useState(() =>
    readLocalStorageWorkspaceSidebarState({ defaults, reset, storageKey }),
  );
  const [sidebarState, setSidebarState] = React.useState(
    initialSidebarState.state,
  );
  const [preferenceSource, setPreferenceSource] =
    React.useState<PublicLayoutSidebarPreferenceSource>(
      initialSidebarState.source,
    );
  const latestSidebarStateRef = React.useRef(sidebarState);
  const pendingWidthPersistTimeoutRef = React.useRef<number | null>(null);

  const clearPendingWidthPersist = React.useCallback(() => {
    if (pendingWidthPersistTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(pendingWidthPersistTimeoutRef.current);
    pendingWidthPersistTimeoutRef.current = null;
  }, []);

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
      pendingWidthPersistTimeoutRef.current = window.setTimeout(() => {
        pendingWidthPersistTimeoutRef.current = null;
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
      nextState: WorkspaceSidebarState,
      persistenceMode: "immediate" | "width_deferred",
    ) => {
      if (
        areWorkspaceSidebarStatesEqual(latestSidebarStateRef.current, nextState)
      ) {
        return;
      }

      latestSidebarStateRef.current = nextState;
      setSidebarState(nextState);
      setPreferenceSource("local");
      if (persistenceMode === "immediate") {
        persistSidebarState(nextState);
        return;
      }

      scheduleWidthPersist(nextState);
    },
    [persistSidebarState, scheduleWidthPersist],
  );

  React.useEffect(() => {
    const nextSidebarState = readLocalStorageWorkspaceSidebarState({
      defaults,
      reset,
      storageKey,
    });
    latestSidebarStateRef.current = nextSidebarState.state;
    setSidebarState(nextSidebarState.state);
    setPreferenceSource(nextSidebarState.source);
    clearPendingWidthPersist();
  }, [clearPendingWidthPersist, defaults, reset, storageKey]);

  React.useEffect(() => {
    return () => {
      clearPendingWidthPersist();
    };
  }, [clearPendingWidthPersist]);

  const setLeftDesktopOpen = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (value) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = {
        ...currentState,
        leftDesktopOpen: resolveNextState(currentState.leftDesktopOpen, value),
      };
      applySidebarState(nextState, "immediate");
    },
    [applySidebarState],
  );

  const setRightDesktopOpen = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (value) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = {
        ...currentState,
        rightDesktopOpen: resolveNextState(
          currentState.rightDesktopOpen,
          value,
        ),
      };
      applySidebarState(nextState, "immediate");
    },
    [applySidebarState],
  );

  const setLeftDesktopWidthPx = React.useCallback<
    React.Dispatch<React.SetStateAction<number>>
  >(
    (value) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = {
        ...currentState,
        leftDesktopWidthPx: resolveNextState(
          currentState.leftDesktopWidthPx,
          value,
        ),
      };
      applySidebarState(nextState, "width_deferred");
    },
    [applySidebarState],
  );

  const setRightDesktopWidthPx = React.useCallback<
    React.Dispatch<React.SetStateAction<number>>
  >(
    (value) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = {
        ...currentState,
        rightDesktopWidthPx: resolveNextState(
          currentState.rightDesktopWidthPx,
          value,
        ),
      };
      applySidebarState(nextState, "width_deferred");
    },
    [applySidebarState],
  );

  const setLeftMobileWidthPx = React.useCallback<
    React.Dispatch<React.SetStateAction<number>>
  >(
    (value) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = {
        ...currentState,
        leftMobileWidthPx: resolveNextState(
          currentState.leftMobileWidthPx,
          value,
        ),
      };
      applySidebarState(nextState, "width_deferred");
    },
    [applySidebarState],
  );

  const setRightMobileWidthPx = React.useCallback<
    React.Dispatch<React.SetStateAction<number>>
  >(
    (value) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = {
        ...currentState,
        rightMobileWidthPx: resolveNextState(
          currentState.rightMobileWidthPx,
          value,
        ),
      };
      applySidebarState(nextState, "width_deferred");
    },
    [applySidebarState],
  );

  const setMobilePane = React.useCallback<
    React.Dispatch<React.SetStateAction<WorkspaceSidebarState["mobilePane"]>>
  >(
    (value) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = {
        ...currentState,
        mobilePane: resolveNextState(currentState.mobilePane, value),
      };
      applySidebarState(nextState, "immediate");
    },
    [applySidebarState],
  );

  return {
    ...sidebarState,
    preferenceSource,
    setLeftDesktopOpen,
    setLeftDesktopWidthPx,
    setLeftMobileWidthPx,
    setMobilePane,
    setRightDesktopOpen,
    setRightDesktopWidthPx,
    setRightMobileWidthPx,
  };
}
