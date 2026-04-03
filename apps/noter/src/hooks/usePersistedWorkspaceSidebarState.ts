import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { api } from "../../convex/_generated/api";
import type {
  WorkspaceSidebarState,
  WorkspaceSidebarStateKey,
} from "../../convex/workspaceSidebarStateModel";

const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;

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

type UsePersistedWorkspaceSidebarStateArgs = {
  defaults: WorkspaceSidebarState;
  workspaceKey: WorkspaceSidebarStateKey;
};

type UsePersistedWorkspaceSidebarStateResult = WorkspaceSidebarState & {
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

/**
 * Keep shared shell state responsive locally while syncing the durable source
 * of truth through Convex for real routes.
 */
export function usePersistedWorkspaceSidebarState({
  defaults,
  workspaceKey,
}: UsePersistedWorkspaceSidebarStateArgs): UsePersistedWorkspaceSidebarStateResult {
  const persistedState = useQuery(
    api.workspaceSidebarState.getWorkspaceSidebarState,
    {
      workspaceKey,
    },
  );
  const setWorkspaceSidebarState = useMutation(
    api.workspaceSidebarState.setWorkspaceSidebarState,
  );
  const [sidebarState, setSidebarState] = React.useState(defaults);
  const latestSidebarStateRef = React.useRef(sidebarState);
  const latestServerStateRef = React.useRef(defaults);
  const hasSeenPersistedStateRef = React.useRef(false);
  const pendingPersistSignatureRef = React.useRef<string | null>(null);
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
      pendingPersistSignatureRef.current =
        serializeWorkspaceSidebarState(nextState);
      void setWorkspaceSidebarState({
        state: nextState,
        workspaceKey,
      }).catch((error: unknown) => {
        console.error("Failed to persist workspace sidebar state:", error);
        pendingPersistSignatureRef.current = null;
        const fallbackState = latestServerStateRef.current;
        latestSidebarStateRef.current = fallbackState;
        setSidebarState(fallbackState);
      });
    },
    [clearPendingWidthPersist, setWorkspaceSidebarState, workspaceKey],
  );

  const scheduleWidthPersist = React.useCallback(
    (nextState: WorkspaceSidebarState) => {
      clearPendingWidthPersist();
      pendingWidthPersistTimeoutRef.current = window.setTimeout(() => {
        pendingWidthPersistTimeoutRef.current = null;
        persistSidebarState(nextState);
      }, SIDEBAR_WIDTH_PERSIST_DELAY_MS);
    },
    [clearPendingWidthPersist, persistSidebarState],
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
      if (persistenceMode === "immediate") {
        persistSidebarState(nextState);
        return;
      }
      scheduleWidthPersist(nextState);
    },
    [persistSidebarState, scheduleWidthPersist],
  );

  React.useEffect(() => {
    if (persistedState === undefined) {
      return;
    }

    if (persistedState !== null) {
      hasSeenPersistedStateRef.current = true;
    } else if (hasSeenPersistedStateRef.current) {
      // Once a durable row exists for this workspace, a later null result is
      // more likely to be a transient auth/subscription gap than an intentional
      // delete. Keep the live shell state instead of snapping back to defaults.
      return;
    }

    const nextServerState = persistedState ?? defaults;
    latestServerStateRef.current = nextServerState;
    const nextServerSignature = serializeWorkspaceSidebarState(nextServerState);

    if (pendingPersistSignatureRef.current !== null) {
      if (pendingPersistSignatureRef.current === nextServerSignature) {
        pendingPersistSignatureRef.current = null;
      } else {
        return;
      }
    }

    if (
      areWorkspaceSidebarStatesEqual(
        latestSidebarStateRef.current,
        nextServerState,
      )
    ) {
      return;
    }

    latestSidebarStateRef.current = nextServerState;
    setSidebarState(nextServerState);
  }, [defaults, persistedState]);

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
    setLeftDesktopOpen,
    setLeftDesktopWidthPx,
    setLeftMobileWidthPx,
    setMobilePane,
    setRightDesktopOpen,
    setRightDesktopWidthPx,
    setRightMobileWidthPx,
  };
}
