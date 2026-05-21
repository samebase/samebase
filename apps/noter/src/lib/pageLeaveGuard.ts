import { useEffect } from "react";

const PAGE_LEAVE_CONFIRMATION_MESSAGE = "Changes you made may not be saved.";

const activePageLeaveGuards = new Map<symbol, string>();
let isBeforeUnloadListenerInstalled = false;

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (activePageLeaveGuards.size === 0) {
    return;
  }

  event.preventDefault();
  event.returnValue = PAGE_LEAVE_CONFIRMATION_MESSAGE;
}

function syncBeforeUnloadListener() {
  if (typeof window === "undefined" || typeof window.addEventListener === "undefined") {
    return;
  }

  if (activePageLeaveGuards.size > 0 && !isBeforeUnloadListenerInstalled) {
    window.addEventListener("beforeunload", handleBeforeUnload);
    isBeforeUnloadListenerInstalled = true;
    return;
  }

  if (activePageLeaveGuards.size === 0 && isBeforeUnloadListenerInstalled) {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    isBeforeUnloadListenerInstalled = false;
  }
}

/**
 * Tracks a concrete local work item that would be lost or abandoned if the
 * browser closes before the app can persist it.
 */
export function registerPageLeaveGuard(reason: string): () => void {
  const guardId = Symbol(reason);
  let isReleased = false;

  activePageLeaveGuards.set(guardId, reason);
  syncBeforeUnloadListener();

  return () => {
    if (isReleased) {
      return;
    }

    isReleased = true;
    activePageLeaveGuards.delete(guardId);
    syncBeforeUnloadListener();
  };
}

export function usePageLeaveGuard({ enabled, reason }: { enabled: boolean; reason: string }) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    return registerPageLeaveGuard(reason);
  }, [enabled, reason]);
}
