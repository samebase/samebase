import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import * as React from "react";
import { api } from "../../convex/_generated/api";
import { rootQueries } from "@/routes/root.queries";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStatePersistenceMode,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";

const SIDEBAR_WIDTH_PERSIST_DELAY_MS = 160;

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

/**
The app shell's sidebar state, saved in Convex. It starts from the saved state that the root loader
read as the user, so the server HTML and the hydration already have the saved pane widths, open
state, and mobile pane. It starts from `defaults` when there is no saved state: a visitor without a
session, an account without a saved row, or a sign-in in this tab before the query answers. A change
renders at once and is saved, a toggle immediately and a width after a short pause. A saved state
from another tab or device replaces the local one unless a local change is still being saved.
*/
export function usePersistedWorkspaceSidebarState(
  defaults: SidebarLayoutState,
): SidebarLayoutStateController {
  const { data: persistedState } = useQuery(rootQueries.workspaceSidebarState);
  const { isAuthenticated } = useConvexAuth();
  const setWorkspaceSidebarState = useMutation(api.workspaceSidebarState.setWorkspaceSidebarState);
  const [sidebarState, setSidebarState] = React.useState(() => persistedState ?? defaults);
  const latestSidebarStateRef = React.useRef(sidebarState);
  const latestServerStateRef = React.useRef(sidebarState);
  const hasSeenPersistedStateRef = React.useRef(false);
  const pendingPersistSignatureRef = React.useRef<string | null>(null);
  const pendingQueuedSignatureRef = React.useRef<string | null>(null);
  const pendingWidthPersistTimeoutRef = React.useRef<number | null>(null);
  // A visitor without a session keeps a change in this page. A save before the saved state is known
  // would replace a saved state that the query has not returned yet.
  const canPersist = isAuthenticated && persistedState !== undefined;
  const canPersistRef = React.useRef(canPersist);

  React.useEffect(() => {
    canPersistRef.current = canPersist;
  }, [canPersist]);

  const clearPendingWidthPersist = React.useCallback(() => {
    pendingQueuedSignatureRef.current = null;
    if (pendingWidthPersistTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(pendingWidthPersistTimeoutRef.current);
    pendingWidthPersistTimeoutRef.current = null;
  }, []);

  const persistSidebarState = React.useCallback(
    (nextState: SidebarLayoutState) => {
      clearPendingWidthPersist();
      const attemptedSignature = serializeWorkspaceSidebarState(nextState);
      pendingPersistSignatureRef.current = attemptedSignature;
      void setWorkspaceSidebarState({
        state: nextState,
        workspaceKey: "app",
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
    [clearPendingWidthPersist, setWorkspaceSidebarState],
  );

  const scheduleWidthPersist = React.useCallback(
    (nextState: SidebarLayoutState) => {
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
    (updateState: SidebarLayoutStateUpdate, persistenceMode: SidebarLayoutStatePersistenceMode) => {
      const currentState = latestSidebarStateRef.current;
      const nextState = updateState(currentState);

      if (areWorkspaceSidebarStatesEqual(currentState, nextState)) {
        return;
      }

      latestSidebarStateRef.current = nextState;
      setSidebarState(nextState);
      if (!canPersistRef.current) {
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

    if (areWorkspaceSidebarStatesEqual(latestSidebarStateRef.current, nextServerState)) {
      return;
    }

    latestSidebarStateRef.current = nextServerState;
    setSidebarState(nextServerState);
  }, [clearPendingWidthPersist, defaults, persistedState]);

  React.useEffect(() => {
    return () => {
      clearPendingWidthPersist();
    };
  }, [clearPendingWidthPersist]);

  return React.useMemo(
    () => ({
      isHydrated: true,
      state: sidebarState,
      setState: applySidebarState,
    }),
    [applySidebarState, sidebarState],
  );
}
