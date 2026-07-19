import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { api } from "../../convex/_generated/api";
import type {
  WorkspaceSidebarStateController,
  WorkspaceSidebarStatePersistenceMode,
  WorkspaceSidebarStateUpdate,
} from "@/lib/workspaceSidebarStateController";
import type {
  WorkspaceSidebarState,
  WorkspaceSidebarStateKey,
} from "../../convex/userPreferenceModel";

const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;

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

type UsePersistedWorkspaceSidebarStateArgs = {
  defaults: WorkspaceSidebarState;
  onPersistedStateApplied: ((state: WorkspaceSidebarState) => void) | null;
  workspaceKey: WorkspaceSidebarStateKey;
};

/**
 * Keep shared shell state responsive locally while syncing the durable source
 * of truth through Convex for real routes.
 */
export function usePersistedWorkspaceSidebarState({
  defaults,
  onPersistedStateApplied,
  workspaceKey,
}: UsePersistedWorkspaceSidebarStateArgs): WorkspaceSidebarStateController {
  const persistedState = useQuery(api.workspaceSidebarState.getWorkspaceSidebarState, {
    workspaceKey,
  });
  const setWorkspaceSidebarState = useMutation(api.workspaceSidebarState.setWorkspaceSidebarState);
  const [sidebarState, setSidebarState] = React.useState(defaults);
  const latestSidebarStateRef = React.useRef(sidebarState);
  const latestServerStateRef = React.useRef(defaults);
  const hasSeenPersistedStateRef = React.useRef(false);
  const pendingPersistSignatureRef = React.useRef<string | null>(null);
  const pendingQueuedSignatureRef = React.useRef<string | null>(null);
  const pendingWidthPersistTimeoutRef = React.useRef<number | null>(null);
  const lastWorkspaceKeyRef = React.useRef(workspaceKey);
  const isHydrated = persistedState !== undefined;
  const isHydratedRef = React.useRef(isHydrated);

  React.useEffect(() => {
    isHydratedRef.current = isHydrated;
  }, [isHydrated]);

  const clearPendingWidthPersist = React.useCallback(() => {
    pendingQueuedSignatureRef.current = null;
    if (pendingWidthPersistTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(pendingWidthPersistTimeoutRef.current);
    pendingWidthPersistTimeoutRef.current = null;
  }, []);

  const persistSidebarState = React.useCallback(
    (nextState: WorkspaceSidebarState) => {
      clearPendingWidthPersist();
      const attemptedSignature = serializeWorkspaceSidebarState(nextState);
      pendingPersistSignatureRef.current = attemptedSignature;
      void setWorkspaceSidebarState({
        state: nextState,
        workspaceKey,
      }).catch((error: unknown) => {
        if (
          pendingPersistSignatureRef.current !== attemptedSignature ||
          serializeWorkspaceSidebarState(latestSidebarStateRef.current) !== attemptedSignature
        ) {
          return;
        }
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
      pendingQueuedSignatureRef.current = serializeWorkspaceSidebarState(nextState);
      pendingWidthPersistTimeoutRef.current = window.setTimeout(() => {
        pendingWidthPersistTimeoutRef.current = null;
        pendingQueuedSignatureRef.current = null;
        persistSidebarState(nextState);
      }, SIDEBAR_WIDTH_PERSIST_DELAY_MS);
    },
    [clearPendingWidthPersist, persistSidebarState],
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
      if (!isHydratedRef.current) {
        return;
      }
      if (persistenceMode === "immediate") {
        persistSidebarState(nextState);
        return;
      }
      scheduleWidthPersist(nextState);
    },
    [persistSidebarState, scheduleWidthPersist],
  );

  React.useEffect(() => {
    if (lastWorkspaceKeyRef.current === workspaceKey) {
      return;
    }

    lastWorkspaceKeyRef.current = workspaceKey;
    hasSeenPersistedStateRef.current = false;
    pendingPersistSignatureRef.current = null;
    clearPendingWidthPersist();
    latestServerStateRef.current = defaults;
    latestSidebarStateRef.current = defaults;
    setSidebarState(defaults);
  }, [clearPendingWidthPersist, defaults, workspaceKey]);

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
    const currentLocalSignature = serializeWorkspaceSidebarState(latestSidebarStateRef.current);

    if (
      (pendingQueuedSignatureRef.current !== null || pendingPersistSignatureRef.current !== null) &&
      nextServerSignature !== currentLocalSignature
    ) {
      return;
    }

    if (pendingQueuedSignatureRef.current === nextServerSignature) {
      clearPendingWidthPersist();
    }

    if (pendingPersistSignatureRef.current !== null) {
      if (nextServerSignature !== currentLocalSignature) {
        return;
      }
      pendingPersistSignatureRef.current = null;
    }

    if (persistedState !== null && onPersistedStateApplied !== null) {
      onPersistedStateApplied(nextServerState);
    }

    if (areWorkspaceSidebarStatesEqual(latestSidebarStateRef.current, nextServerState)) {
      return;
    }

    latestSidebarStateRef.current = nextServerState;
    setSidebarState(nextServerState);
  }, [clearPendingWidthPersist, defaults, onPersistedStateApplied, persistedState]);

  React.useEffect(() => {
    return () => {
      clearPendingWidthPersist();
    };
  }, [clearPendingWidthPersist]);

  return React.useMemo(
    () => ({
      isHydrated,
      state: sidebarState,
      setState: applySidebarState,
    }),
    [applySidebarState, isHydrated, sidebarState],
  );
}
